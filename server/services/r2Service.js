import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const DEFAULT_PRESIGN_EXPIRY_SECONDS = 60 * 10;

const requiredEnv = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];

const getMissingEnv = () => requiredEnv.filter((name) => !process.env[name]);

export const isR2Configured = () => getMissingEnv().length === 0;

const assertConfigured = () => {
  const missing = getMissingEnv();
  if (missing.length > 0) {
    throw new Error(`R2 is not configured. Missing env vars: ${missing.join(', ')}`);
  }
};

const getMaxUploadBytes = () => {
  const configured = Number(process.env.R2_MAX_UPLOAD_BYTES || process.env.IMPORT_MAX_FILE_SIZE_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_UPLOAD_BYTES;
};

const getBucket = () => {
  assertConfigured();
  return process.env.R2_BUCKET;
};

const getClient = () => {
  assertConfigured();
  const endpoint = process.env.R2_S3_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
};

const sanitizeName = (name) => (name || 'upload')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(-120) || 'upload';

export const createImportObjectKey = ({ projectId, fileName, userId }) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `imports/${projectId}/${userId}/${stamp}-${crypto.randomUUID()}-${sanitizeName(fileName)}`;
};

export const createPresignedImportUpload = async ({ objectKey, fileType }) => {
  const client = getClient();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
    ContentType: fileType || 'application/octet-stream',
  });
  const expiresIn = DEFAULT_PRESIGN_EXPIRY_SECONDS;
  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  return {
    uploadUrl,
    expiresAt: Date.now() + (expiresIn * 1000),
    maxFileSizeBytes: getMaxUploadBytes(),
  };
};

export const headImportObject = async (objectKey) => {
  const client = getClient();
  return await client.send(new HeadObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
  }));
};

export const getImportObjectResponse = async (objectKey) => {
  const client = getClient();
  return await client.send(new GetObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
  }));
};

export const deleteImportObject = async (objectKey) => {
  const client = getClient();
  await client.send(new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
  }));
};

export const getR2UploadLimits = () => ({
  maxFileSizeBytes: getMaxUploadBytes(),
});
