/**
 * GIF-to-MP4 Conversion Utility
 *
 * Converts GIF files to H.264 MP4 using FFmpeg via raw execSync.
 * Uses ffmpeg-static bundled binary when system FFmpeg is unavailable.
 * Used by the clip library endpoints to accept GIF recordings
 * from the MCP browser tool and convert them to video clips
 * for the Shotstack video assembly pipeline.
 */

import { randomUUID } from "crypto";
import { writeFile, readFile, unlink } from "fs/promises";
import { existsSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { createRequire } from "module";

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fileSize: number;
}

/** Resolve the ffmpeg binary path (ffmpeg-static or system PATH) */
function getFFmpegPath(): string {
  // Try ffmpeg-static first
  try {
    const esmRequire = createRequire(import.meta.url);
    const staticPath = esmRequire("ffmpeg-static") as string;
    if (staticPath && existsSync(staticPath)) return staticPath;
  } catch { /* not installed */ }

  // Fall back to system PATH
  try {
    return execSync("which ffmpeg", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error("FFmpeg not found — install ffmpeg-static or add ffmpeg to PATH");
  }
}

/** Resolve the ffprobe binary path (ffprobe-static or system PATH) */
function getFFprobePath(): string {
  try {
    const esmRequire = createRequire(import.meta.url);
    const staticPkg = esmRequire("ffprobe-static") as { path: string };
    if (staticPkg?.path && existsSync(staticPkg.path)) return staticPkg.path;
  } catch { /* not installed */ }

  try {
    return execSync("which ffprobe", { encoding: "utf-8" }).trim();
  } catch {
    return ""; // ffprobe optional — metadata will use defaults
  }
}

export function isFFmpegAvailable(): boolean {
  try {
    getFFmpegPath();
    return true;
  } catch {
    return false;
  }
}

export async function convertGifToMp4(gifBuffer: Buffer): Promise<{
  mp4Buffer: Buffer;
  metadata: VideoMetadata;
}> {
  const ffmpegPath = getFFmpegPath();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `sba-gif-${id}.gif`);
  const outputPath = join(tmpdir(), `sba-mp4-${id}.mp4`);

  try {
    await writeFile(inputPath, gifBuffer);

    // Run ffmpeg directly via execSync (fluent-ffmpeg crashes in ESM builds on Railway)
    const cmd = `"${ffmpegPath}" -y -i "${inputPath}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "${outputPath}" 2>&1`;
    try {
      execSync(cmd, { encoding: "utf-8", timeout: 30000 });
    } catch (e: any) {
      // FFmpeg returns non-zero exit on some valid conversions — check if output exists
      if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
        throw new Error(`FFmpeg conversion failed: ${e.message?.substring(0, 300)}`);
      }
    }

    if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
      throw new Error("FFmpeg produced no output — GIF may be too small or invalid");
    }

    const mp4Buffer = await readFile(outputPath);
    const metadata = probeFile(outputPath);
    metadata.fileSize = mp4Buffer.length;

    return { mp4Buffer, metadata };
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
  }
}

/** Extract metadata via ffprobe (execSync). Returns defaults if ffprobe unavailable. */
function probeFile(filePath: string): VideoMetadata {
  const ffprobePath = getFFprobePath();
  if (!ffprobePath) {
    return { durationSeconds: 0, width: 0, height: 0, fileSize: 0 };
  }

  try {
    const json = execSync(
      `"${ffprobePath}" -v quiet -print_format json -show_format -show_streams "${filePath}" 2>/dev/null`,
      { encoding: "utf-8", timeout: 10000 }
    );
    const data = JSON.parse(json);
    const videoStream = data.streams?.find((s: any) => s.codec_type === "video");
    return {
      durationSeconds: parseFloat(data.format?.duration || "0"),
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      fileSize: parseInt(data.format?.size || "0", 10),
    };
  } catch {
    return { durationSeconds: 0, width: 0, height: 0, fileSize: 0 };
  }
}

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // File may not exist if conversion failed early
  }
}
