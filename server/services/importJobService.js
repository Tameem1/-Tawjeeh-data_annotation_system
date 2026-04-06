import crypto from 'crypto';
import { getDatabase } from './database.js';

const db = getDatabase();

const JOB_STALE_MS = 15 * 60 * 1000;

const parseJson = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const toJob = (row) => row ? {
  id: row.id,
  projectId: row.project_id,
  createdBy: row.created_by,
  status: row.status,
  objectKey: row.object_key,
  fileName: row.file_name,
  fileType: row.file_type,
  fileSize: row.file_size,
  options: parseJson(row.options_json, {}),
  rowsProcessed: row.rows_processed,
  rowsImported: row.rows_imported || 0,
  errorMessage: row.error_message,
  createdAt: row.created_at,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  lockedAt: row.locked_at,
} : null;

const insertJobStmt = db.prepare(`
  INSERT INTO import_jobs (
    id, project_id, created_by, status, object_key, file_name, file_type, file_size,
    options_json, rows_processed, rows_imported, error_message, created_at, started_at, finished_at, locked_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, NULL, NULL, NULL)
`);

const getJobStmt = db.prepare('SELECT * FROM import_jobs WHERE id = ?');
const getNextQueuedStmt = db.prepare('SELECT * FROM import_jobs WHERE status = ? ORDER BY created_at ASC LIMIT 1');
const claimJobStmt = db.prepare(`
  UPDATE import_jobs
  SET status = 'processing', started_at = COALESCE(started_at, ?), locked_at = ?, error_message = NULL
  WHERE id = ? AND status = 'queued'
`);
const updateProgressStmt = db.prepare('UPDATE import_jobs SET rows_processed = ?, locked_at = ? WHERE id = ? AND status = \'processing\'');
const failJobStmt = db.prepare(`
  UPDATE import_jobs
  SET status = 'failed', error_message = ?, finished_at = ?, locked_at = NULL
  WHERE id = ?
`);
const completeJobStmt = db.prepare(`
  UPDATE import_jobs
  SET status = 'completed', rows_processed = ?, rows_imported = ?, finished_at = ?, locked_at = NULL, error_message = NULL
  WHERE id = ?
`);
const requeueStaleStmt = db.prepare(`
  UPDATE import_jobs
  SET status = 'queued', locked_at = NULL, error_message = NULL
  WHERE status = 'processing' AND locked_at IS NOT NULL AND locked_at < ?
`);
const insertStagingStmt = db.prepare(`
  INSERT INTO import_staging_data_points (
    job_id, row_order, id, project_id, content, type, original_annotation, human_annotation, final_annotation,
    ai_suggestions, ratings, status, confidence, upload_prompt, custom_field, custom_field_name,
    custom_field_values, metadata, display_metadata, split, annotator_id, annotator_name,
    annotated_at, is_iaa, assignments, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const clearStagingStmt = db.prepare('DELETE FROM import_staging_data_points WHERE job_id = ?');
const markIaaStmt = db.prepare(`
  UPDATE import_staging_data_points
  SET is_iaa = 1
  WHERE job_id = ? AND row_order = ?
`);
const deleteProjectRowsStmt = db.prepare('DELETE FROM data_points WHERE project_id = ?');
const publishStagingStmt = db.prepare(`
  INSERT INTO data_points (
    id, project_id, content, type, original_annotation, human_annotation, final_annotation,
    ai_suggestions, ratings, status, confidence, upload_prompt, custom_field, custom_field_name,
    custom_field_values, metadata, display_metadata, split, annotator_id, annotator_name,
    annotated_at, is_iaa, assignments, created_at, updated_at
  )
  SELECT
    id, project_id, content, type, original_annotation, human_annotation, final_annotation,
    ai_suggestions, ratings, status, confidence, upload_prompt, custom_field, custom_field_name,
    custom_field_values, metadata, display_metadata, split, annotator_id, annotator_name,
    annotated_at, is_iaa, assignments, created_at, updated_at
  FROM import_staging_data_points
  WHERE job_id = ?
  ORDER BY row_order
`);
const updateProjectStatsStmt = db.prepare(`
  INSERT INTO project_stats (project_id, total_accepted, total_rejected, total_edited, total_processed, average_confidence, session_time)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(project_id) DO UPDATE SET
    total_accepted = excluded.total_accepted,
    total_rejected = excluded.total_rejected,
    total_edited = excluded.total_edited,
    total_processed = excluded.total_processed,
    average_confidence = excluded.average_confidence,
    session_time = excluded.session_time
`);
const updateProjectUpdatedAtStmt = db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?');

export const createImportJob = ({ projectId, createdBy, objectKey, fileName, fileType, fileSize, options }) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  insertJobStmt.run(
    id,
    projectId,
    createdBy,
    'queued',
    objectKey,
    fileName,
    fileType,
    fileSize,
    JSON.stringify(options || {}),
    now
  );
  return toJob(getJobStmt.get(id));
};

export const getImportJob = (jobId) => toJob(getJobStmt.get(jobId));

export const recoverStaleImportJobs = () => {
  const cutoff = Date.now() - JOB_STALE_MS;
  return requeueStaleStmt.run(cutoff).changes;
};

export const claimNextImportJob = () => {
  const now = Date.now();
  const queued = getNextQueuedStmt.get('queued');
  if (!queued) return null;
  const claimed = claimJobStmt.run(now, now, queued.id);
  if (claimed.changes === 0) return null;
  return toJob(getJobStmt.get(queued.id));
};

export const updateImportJobProgress = (jobId, rowsProcessed) => {
  updateProgressStmt.run(rowsProcessed, Date.now(), jobId);
};

export const failImportJob = (jobId, message) => {
  failJobStmt.run(message, Date.now(), jobId);
};

export const completeImportJob = (jobId, rowsProcessed, rowsImported) => {
  completeJobStmt.run(rowsProcessed, rowsImported, Date.now(), jobId);
};

const insertStagingBatchTx = db.transaction((jobId, projectId, rows) => {
  for (const row of rows) {
    insertStagingStmt.run(
      jobId,
      row.rowOrder,
      row.id,
      projectId,
      row.content,
      row.type || 'text',
      row.originalAnnotation || null,
      row.humanAnnotation || null,
      row.finalAnnotation || null,
      JSON.stringify(row.aiSuggestions || {}),
      JSON.stringify(row.ratings || {}),
      row.status || 'pending',
      row.confidence || null,
      row.uploadPrompt || null,
      row.customField || null,
      row.customFieldName || null,
      JSON.stringify(row.customFieldValues || {}),
      JSON.stringify(row.metadata || {}),
      JSON.stringify(row.displayMetadata || {}),
      row.split || null,
      row.annotatorId || null,
      row.annotatorName || null,
      row.annotatedAt || null,
      row.isIAA ? 1 : 0,
      JSON.stringify(row.assignments || []),
      row.createdAt,
      row.updatedAt
    );
  }
});

export const insertImportStagingBatch = (jobId, projectId, rows) => {
  if (rows.length === 0) return;
  insertStagingBatchTx(jobId, projectId, rows);
};

const markIaaRowsTx = db.transaction((jobId, rowOrders) => {
  for (const rowOrder of rowOrders) {
    markIaaStmt.run(jobId, rowOrder);
  }
});

export const markImportStagingIaaRows = (jobId, rowOrders) => {
  if (rowOrders.length === 0) return;
  markIaaRowsTx(jobId, rowOrders);
};

export const clearImportStaging = (jobId) => {
  clearStagingStmt.run(jobId);
};

const publishImportTx = db.transaction((jobId, projectId, stats, updatedAt) => {
  deleteProjectRowsStmt.run(projectId);
  publishStagingStmt.run(jobId);
  updateProjectStatsStmt.run(
    projectId,
    stats.totalAccepted || 0,
    stats.totalRejected || 0,
    stats.totalEdited || 0,
    stats.totalProcessed || 0,
    stats.averageConfidence || 0,
    stats.sessionTime || 0
  );
  updateProjectUpdatedAtStmt.run(updatedAt, projectId);
  clearStagingStmt.run(jobId);
});

export const publishImportStaging = (jobId, projectId, stats) => {
  publishImportTx(jobId, projectId, stats, Date.now());
};
