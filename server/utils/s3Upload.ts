/**
 * S3 Upload Utility
 *
 * Simple helper for uploading media files to S3.
 * Used by the video generation service to store rendered videos.
 * Reusable for any future media upload needs.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.S3_MEDIA_BUCKET || process.env.AWS_S3_BUCKET || "smallbizagent-media";
const REGION = process.env.AWS_REGION || "us-east-1";

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return s3Client;
}

/**
 * Check if S3 is configured (has credentials).
 */
export function isS3Configured(): boolean {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

/**
 * Upload a buffer to S3.
 * @returns The public URL of the uploaded file.
 */
export async function uploadBufferToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return getPublicUrl(key);
}

/**
 * Download a file from a URL and upload it to S3.
 * @returns The public S3 URL.
 */
export async function uploadUrlToS3(
  sourceUrl: string,
  key: string,
  contentType: string = "video/mp4"
): Promise<string> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file from ${sourceUrl}: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return uploadBufferToS3(buffer, key, contentType);
}

/**
 * Get the public URL for an S3 object.
 */
export function getPublicUrl(key: string): string {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}
