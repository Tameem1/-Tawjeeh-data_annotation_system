import { parse } from 'csv-parse';
import {
  claimNextImportJob,
  clearImportStaging,
  completeImportJob,
  failImportJob,
  getImportJob,
  insertImportStagingBatch,
  markImportStagingIaaRows,
  publishImportStaging,
  recoverStaleImportJobs,
  updateImportJobProgress
} from './importJobService.js';
import { deleteImportObject, getImportObjectResponse, isR2Configured } from './r2Service.js';
import {
  applyIaaSelectionToDataPoint,
  createCsvMapper,
  createIaaSelection,
  createImportOptions,
  mapCsvValuesToDataPoint,
  mapJsonItemToDataPoint,
  mapTxtLineToDataPoint
} from './projectImport.js';
import { getDatabase } from './database.js';
import { Readable } from 'stream';

const db = getDatabase();
const BATCH_SIZE = 500;
const POLL_INTERVAL_MS = 3000;
let workerStarted = false;
let isProcessing = false;
const DEFAULT_IMPORT_STATS = {
  totalAccepted: 0,
  totalRejected: 0,
  totalEdited: 0,
  totalProcessed: 0,
  averageConfidence: 0,
  sessionTime: 0
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getProjectIaaConfig = (projectId) => {
  const row = db.prepare('SELECT iaa_config FROM projects WHERE id = ?').get(projectId);
  if (!row?.iaa_config) return null;
  try {
    return JSON.parse(row.iaa_config);
  } catch {
    return null;
  }
};

const stageBatch = async (job, batch) => {
  insertImportStagingBatch(job.id, job.projectId, batch);
  if (batch.length > 0) {
    updateImportJobProgress(job.id, batch[batch.length - 1].rowOrder + 1);
  }
};

const processCsvJob = async (job, options, response, iaaConfig) => {
  const body = response.Body;
  if (!body) throw new Error('R2 object body is empty.');

  const parser = parse({
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true
  });

  const stream = body instanceof Readable ? body : Readable.fromWeb(body.transformToWebStream());
  const input = stream.pipe(parser);
  let mapper = null;
  let batch = [];
  let rowOrder = 0;

  for await (const record of input) {
    if (!mapper) {
      mapper = createCsvMapper(record, options);
      continue;
    }
    const now = Date.now();
    const dataPoint = mapCsvValuesToDataPoint(record, mapper, now);
    batch.push({ ...dataPoint, rowOrder, createdAt: now, updatedAt: now, isIAA: false, assignments: [] });
    rowOrder += 1;

    if (batch.length >= BATCH_SIZE) {
      await stageBatch(job, batch);
      batch = [];
    }
  }

  if (!mapper) {
    throw new Error('CSV file is empty.');
  }

  if (batch.length > 0) {
    await stageBatch(job, batch);
  }

  if (rowOrder === 0) {
    throw new Error('CSV file is empty.');
  }

  const iaaSelection = createIaaSelection(rowOrder, job.projectId, iaaConfig);
  markImportStagingIaaRows(job.id, Array.from(iaaSelection));
  updateImportJobProgress(job.id, rowOrder);
  return rowOrder;
};

const processJsonJob = async (job, options, response, iaaConfig) => {
  const text = await response.Body.transformToString();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON syntax.';
    throw new Error(`Invalid JSON syntax. ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('JSON file must contain an array of data points');
  }
  if (parsed.length === 0) {
    throw new Error('JSON file is empty.');
  }

  const iaaSelection = createIaaSelection(parsed.length, job.projectId, iaaConfig);
  let batch = [];

  parsed.forEach((item, rowOrder) => {
    const now = Date.now();
    const base = mapJsonItemToDataPoint(item, options, now);
    const row = applyIaaSelectionToDataPoint({ ...base, createdAt: now, updatedAt: now }, rowOrder, iaaSelection);
    batch.push({ ...row, rowOrder });
    if (batch.length >= BATCH_SIZE) {
      insertImportStagingBatch(job.id, job.projectId, batch);
      updateImportJobProgress(job.id, rowOrder + 1);
      batch = [];
    }
  });

  if (batch.length > 0) {
    insertImportStagingBatch(job.id, job.projectId, batch);
  }

  updateImportJobProgress(job.id, parsed.length);
  return parsed.length;
};

const processTxtJob = async (job, options, response, iaaConfig) => {
  const text = await response.Body.transformToString();
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    throw new Error('TXT file is empty.');
  }

  const iaaSelection = createIaaSelection(lines.length, job.projectId, iaaConfig);
  let batch = [];
  lines.forEach((line, rowOrder) => {
    const now = Date.now();
    const base = mapTxtLineToDataPoint(line, options, now);
    const row = applyIaaSelectionToDataPoint({ ...base, createdAt: now, updatedAt: now }, rowOrder, iaaSelection);
    batch.push({ ...row, rowOrder });
    if (batch.length >= BATCH_SIZE) {
      insertImportStagingBatch(job.id, job.projectId, batch);
      updateImportJobProgress(job.id, rowOrder + 1);
      batch = [];
    }
  });

  if (batch.length > 0) {
    insertImportStagingBatch(job.id, job.projectId, batch);
  }

  updateImportJobProgress(job.id, lines.length);
  return lines.length;
};

const processOneJob = async (job) => {
  const startedAt = Date.now();
  const options = createImportOptions(job.options);
  const iaaConfig = getProjectIaaConfig(job.projectId);
  console.log(`[import-worker] claimed jobId=${job.id} project=${job.projectId} file=${job.fileName}`);

  try {
    clearImportStaging(job.id);
    console.log(`[import-worker] download_started jobId=${job.id} objectKey=${job.objectKey}`);
    const response = await getImportObjectResponse(job.objectKey);
    const fileType = job.fileType.toLowerCase();
    let rowsImported = 0;

    if (fileType === '.csv') {
      rowsImported = await processCsvJob(job, options, response, iaaConfig);
    } else if (fileType === '.json') {
      rowsImported = await processJsonJob(job, options, response, iaaConfig);
    } else if (fileType === '.txt') {
      rowsImported = await processTxtJob(job, options, response, iaaConfig);
    } else {
      throw new Error(`Unsupported file type "${fileType}". Please upload a JSON, CSV, or TXT file.`);
    }

    const latestJob = getImportJob(job.id);

    console.log(`[import-worker] publish_started jobId=${job.id} rows=${rowsImported}`);
    publishImportStaging(job.id, job.projectId, DEFAULT_IMPORT_STATS);
    completeImportJob(job.id, latestJob?.rowsProcessed || rowsImported, rowsImported);

    try {
      await deleteImportObject(job.objectKey);
    } catch (cleanupError) {
      console.error(`[import-worker] cleanup_failed jobId=${job.id}`, cleanupError);
    }

    console.log(`[import-worker] completed jobId=${job.id} rows=${rowsImported} elapsed_ms=${Date.now() - startedAt}`);
  } catch (error) {
    clearImportStaging(job.id);
    failImportJob(job.id, error instanceof Error ? error.message : 'Unknown import failure');
    try {
      await deleteImportObject(job.objectKey);
    } catch (cleanupError) {
      console.error(`[import-worker] cleanup_failed jobId=${job.id}`, cleanupError);
    }
    console.error(`[import-worker] failed jobId=${job.id}`, error);
  }
};

const tick = async () => {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const job = claimNextImportJob();
    if (job) {
      await processOneJob(job);
    }
  } finally {
    isProcessing = false;
  }
};

export const startImportWorker = () => {
  if (workerStarted) return;
  workerStarted = true;

  if (!isR2Configured()) {
    console.warn('[import-worker] R2 is not configured; import worker disabled');
    return;
  }

  const recovered = recoverStaleImportJobs();
  if (recovered > 0) {
    console.log(`[import-worker] recovered stale jobs=${recovered}`);
  }

  setInterval(() => {
    tick().catch((error) => {
      console.error('[import-worker] tick_failed', error);
    });
  }, POLL_INTERVAL_MS);

  sleep(500).then(() => tick()).catch((error) => {
    console.error('[import-worker] startup_failed', error);
  });
};
