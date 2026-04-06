import crypto from 'crypto';

const DEFAULT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const toDisplayString = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const getImportMaxFileSizeBytes = () => {
  const configured = Number(process.env.IMPORT_MAX_FILE_SIZE_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_FILE_SIZE_BYTES;
};

export const normalizeCsvHeader = (rawHeader) => {
  const seen = new Map();
  return rawHeader.map((name, index) => {
    const baseName = String(name ?? '').trim() || `column_${index + 1}`;
    const key = baseName.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return count === 0 ? baseName : `${baseName}_${count + 1}`;
  });
};

export const parseCsvText = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim() !== '')) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim() !== '')) {
    rows.push(row);
  }

  return rows;
};

const inferDataPointType = (content, explicitType) => {
  if (explicitType === 'image' || explicitType === 'audio' || explicitType === 'text') {
    return explicitType;
  }

  const lowerContent = String(content || '').toLowerCase();
  if (lowerContent.startsWith('data:audio/') || /\.(mp3|wav|m4a)(\?.*)?$/.test(lowerContent)) {
    return 'audio';
  }

  return 'text';
};

const toMetadataRecord = (record) => {
  const metadata = {};
  Object.entries(record).forEach(([key, value]) => {
    metadata[key] = toDisplayString(value);
  });
  return metadata;
};

const toDisplayMetadataRecord = (metadata, selectedDisplayColumns = [], contentColumn) => {
  const selectedColumns = selectedDisplayColumns.filter((column) => column && column !== contentColumn);
  if (selectedColumns.length === 0) return {};

  const displayMetadata = {};
  selectedColumns.forEach((column) => {
    if (Object.prototype.hasOwnProperty.call(metadata, column)) {
      displayMetadata[column] = metadata[column];
    }
  });
  return displayMetadata;
};

const hashStringToSeed = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const mulberry32 = (seed) => {
  let t = seed;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleWithRng = (items, rng) => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const applyAssignmentsToDataPoints = (points, projectId, iaaConfig) => {
  const enabled = !!iaaConfig?.enabled && (iaaConfig?.portionPercent ?? 0) > 0;
  const portion = Math.max(0, Math.min(100, Math.floor(iaaConfig?.portionPercent ?? 0)));
  const annotatorsPerItem = Math.max(2, Math.floor(iaaConfig?.annotatorsPerIAAItem ?? 2));
  const seedBase = (iaaConfig?.seed ?? 0) + hashStringToSeed(projectId ?? '');
  const rng = mulberry32(seedBase);

  const total = points.length;
  const iaaCount = enabled ? Math.min(total, Math.ceil((total * portion) / 100)) : 0;
  const indices = shuffleWithRng(Array.from({ length: total }, (_, i) => i), rng);
  const iaaSet = new Set(indices.slice(0, iaaCount));

  return points.map((dp, index) => {
    const isIAA = enabled && iaaSet.has(index);
    return {
      ...dp,
      isIAA,
      iaaRequiredCount: isIAA ? annotatorsPerItem : 1,
      assignments: [],
      status: 'pending',
      finalAnnotation: '',
      humanAnnotation: '',
      annotationDrafts: {}
    };
  });
};

export const computeProjectStats = (dataPoints) => {
  const accepted = dataPoints.filter((dp) => dp.status === 'accepted').length;
  const rejected = dataPoints.filter((dp) => dp.status === 'pending' && Object.keys(dp.aiSuggestions || {}).length > 0).length;
  const edited = dataPoints.filter((dp) => dp.status === 'edited').length;
  const processed = dataPoints.filter((dp) => dp.status === 'ai_processed').length;
  const confidenceScores = dataPoints
    .filter((dp) => typeof dp.confidence === 'number' && dp.confidence > 0)
    .map((dp) => dp.confidence);

  return {
    totalAccepted: accepted,
    totalRejected: rejected,
    totalEdited: edited,
    totalProcessed: processed,
    averageConfidence: confidenceScores.length > 0
      ? Math.round((confidenceScores.reduce((sum, conf) => sum + conf, 0) / confidenceScores.length) * 1000) / 1000
      : 0,
    sessionTime: 0
  };
};

const buildJsonDataPoints = ({ jsonData, prompt, customFieldName, selectedDisplayColumns, now }) => {
  if (!Array.isArray(jsonData)) {
    throw new Error('JSON file must contain an array of data points');
  }

  if (jsonData.length === 0) {
    throw new Error('JSON file is empty.');
  }

  return jsonData.map((item) => {
    const metadata = item && typeof item === 'object' && !Array.isArray(item)
      ? toMetadataRecord(item)
      : {};
    const content = typeof item === 'string'
      ? item
      : item?.text || item?.content || JSON.stringify(item);

    return {
      id: crypto.randomUUID(),
      content,
      type: inferDataPointType(content, item?.type),
      originalAnnotation: item?.annotation || item?.label || '',
      aiSuggestions: {},
      ratings: {},
      status: 'pending',
      uploadPrompt: prompt || item?.prompt || '',
      customField: '',
      customFieldName,
      metadata,
      displayMetadata: toDisplayMetadataRecord(metadata, selectedDisplayColumns),
      customFieldValues: {},
      annotatedAt: now
    };
  });
};

const buildCsvDataPoints = ({ csvText, prompt, customFieldName, selectedContentColumn, selectedDisplayColumns, now }) => {
  const rows = parseCsvText(csvText);
  if (rows.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const rawHeader = rows[0];
  if (rawHeader.length === 0) {
    throw new Error('CSV header row is missing.');
  }

  const header = normalizeCsvHeader(rawHeader);
  let contentIndex = selectedContentColumn
    ? header.findIndex((h) => h === selectedContentColumn)
    : header.findIndex((h) => h.toLowerCase().includes('text') || h.toLowerCase().includes('content'));

  if (contentIndex < 0) {
    const fallbackIndex = header.findIndex((h) => h.toLowerCase() !== 'id');
    if (fallbackIndex >= 0) {
      contentIndex = fallbackIndex;
    } else {
      const required = selectedContentColumn
        ? `"${selectedContentColumn}"`
        : 'a "text" or "content" column';
      throw new Error(`CSV file is missing ${required}.`);
    }
  }

  const annotationIndex = header.findIndex((h) => h.toLowerCase().includes('label') || h.toLowerCase().includes('annotation'));
  const contentColumn = header[contentIndex];

  const dataPoints = rows.slice(1).map((rawValues) => {
    const values = rawValues.map((value) => value ?? '');
    while (values.length < header.length) {
      values.push('');
    }

    const metadata = {};
    header.forEach((column, index) => {
      if (values[index] !== undefined) {
        metadata[column] = values[index];
      }
    });

    const content = contentIndex >= 0 ? values[contentIndex] : (values[0] || '');
    return {
      id: crypto.randomUUID(),
      content,
      type: inferDataPointType(content, metadata.type),
      originalAnnotation: annotationIndex >= 0 ? values[annotationIndex] : '',
      aiSuggestions: {},
      ratings: {},
      status: 'pending',
      uploadPrompt: prompt,
      customField: '',
      customFieldName,
      metadata,
      displayMetadata: toDisplayMetadataRecord(metadata, selectedDisplayColumns, contentColumn),
      customFieldValues: {},
      annotatedAt: now
    };
  });

  if (dataPoints.length === 0) {
    throw new Error('CSV file is empty.');
  }

  return dataPoints;
};

const buildTxtDataPoints = ({ text, prompt, customFieldName }) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    throw new Error('TXT file is empty.');
  }

  return lines.map((line) => ({
    id: crypto.randomUUID(),
    content: line.trim(),
    type: 'text',
    originalAnnotation: '',
    aiSuggestions: {},
    ratings: {},
    status: 'pending',
    uploadPrompt: prompt,
    customField: '',
    customFieldName,
    metadata: {},
    displayMetadata: {},
    customFieldValues: {},
    annotatedAt: Date.now()
  }));
};

export const parseImportedFile = ({
  originalFilename,
  buffer,
  prompt = '',
  customFieldName = '',
  selectedContentColumn = '',
  selectedDisplayColumns = [],
  projectId,
  iaaConfig
}) => {
  const lastDotIndex = originalFilename.lastIndexOf('.');
  const extension = lastDotIndex >= 0 ? originalFilename.slice(lastDotIndex).toLowerCase() : '';
  const text = buffer.toString('utf-8');
  const now = Date.now();

  let dataPoints;
  if (extension === '.csv') {
    dataPoints = buildCsvDataPoints({
      csvText: text,
      prompt,
      customFieldName,
      selectedContentColumn,
      selectedDisplayColumns,
      now
    });
  } else if (extension === '.json') {
    let jsonData;
    try {
      jsonData = JSON.parse(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON syntax.';
      throw new Error(`Invalid JSON syntax. ${message}`);
    }
    dataPoints = buildJsonDataPoints({
      jsonData,
      prompt,
      customFieldName,
      selectedDisplayColumns,
      now
    });
  } else if (extension === '.txt') {
    dataPoints = buildTxtDataPoints({
      text,
      prompt,
      customFieldName
    });
  } else {
    throw new Error(`Unsupported file type "${extension || 'unknown'}". Please upload a JSON, CSV, or TXT file.`);
  }

  const assignedData = applyAssignmentsToDataPoints(dataPoints, projectId, iaaConfig);
  return {
    dataPoints: assignedData,
    stats: computeProjectStats(assignedData),
    extension
  };
};
