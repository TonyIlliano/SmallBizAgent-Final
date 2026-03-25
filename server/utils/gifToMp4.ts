/**
 * GIF-to-MP4 Conversion Utility
 *
 * Converts GIF files to H.264 MP4 using FFmpeg.
 * Uses ffmpeg-static bundled binary when system FFmpeg is unavailable.
 * Used by the clip library endpoints to accept GIF recordings
 * from the MCP browser tool and convert them to video clips
 * for the Shotstack video assembly pipeline.
 */

import { randomUUID } from "crypto";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { createRequire } from "module";
import ffmpeg from "fluent-ffmpeg";

// Set ffmpeg path from ffmpeg-static (ESM-compatible via createRequire)
try {
  const require = createRequire(import.meta.url);
  const ffmpegStaticPath = require("ffmpeg-static") as string;
  if (ffmpegStaticPath) {
    ffmpeg.setFfmpegPath(ffmpegStaticPath);
  }
} catch {
  // ffmpeg-static not installed, rely on system PATH
}

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fileSize: number;
}

export function isFFmpegAvailable(): boolean {
  // Check system PATH first
  try {
    const systemPath = execSync("which ffmpeg", { encoding: "utf-8" }).trim();
    if (systemPath) return true;
  } catch {
    // not on system PATH
  }
  // Check ffmpeg-static
  try {
    const require = createRequire(import.meta.url);
    const ffmpegStaticPath = require("ffmpeg-static") as string;
    if (ffmpegStaticPath) {
      execSync(`test -f "${ffmpegStaticPath}"`, { encoding: "utf-8" });
      return true;
    }
  } catch {
    // ffmpeg-static not available
  }
  return false;
}

export async function convertGifToMp4(gifBuffer: Buffer): Promise<{
  mp4Buffer: Buffer;
  metadata: VideoMetadata;
}> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `sba-gif-${id}.gif`);
  const outputPath = join(tmpdir(), `sba-mp4-${id}.mp4`);

  try {
    await writeFile(inputPath, gifBuffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          "-movflags",
          "faststart",
          "-pix_fmt",
          "yuv420p",
          "-vf",
          "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err: Error) =>
          reject(new Error(`FFmpeg conversion failed: ${err.message}`))
        )
        .run();
    });

    const mp4Buffer = await readFile(outputPath);
    const metadata = await probeFile(outputPath);
    metadata.fileSize = mp4Buffer.length;

    return { mp4Buffer, metadata };
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
  }
}

async function probeFile(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err: Error | null, data: ffmpeg.FfprobeData) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`));

      const videoStream = data.streams.find(
        (s: ffmpeg.FfprobeStream) => s.codec_type === "video"
      );
      resolve({
        durationSeconds: parseFloat(String(data.format.duration || "0")),
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        fileSize: parseInt(String(data.format.size || "0"), 10),
      });
    });
  });
}

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // File may not exist if conversion failed early
  }
}
