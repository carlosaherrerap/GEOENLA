import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'goingup';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: ACCOUNT_ID ? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

/**
 * Sube una imagen en base64 o buffer a Cloudflare R2 y retorna la URL pública.
 */
export async function uploadToR2(
  fileBufferOrBase64: string | Buffer,
  fileName: string,
  contentType: string = 'image/jpeg'
): Promise<string> {
  let buffer: Buffer;

  if (typeof fileBufferOrBase64 === 'string') {
    const base64Data = fileBufferOrBase64.replace(/^data:image\/\w+;base64,/, '');
    buffer = Buffer.from(base64Data, 'base64');
  } else {
    buffer = fileBufferOrBase64;
  }

  const key = `evidences/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await r2Client.send(command);

  const publicDomain = process.env.R2_PUBLIC_DOMAIN || `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}`;
  return `${publicDomain}/${key}`;
}
