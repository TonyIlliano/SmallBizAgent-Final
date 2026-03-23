/**
 * Text-to-Speech Service
 *
 * Generates voiceover audio from text using OpenAI's TTS API.
 * Used by the video assembly pipeline to create narration from
 * a video brief's voiceover script.
 *
 * Cost: ~$0.015 per 1,000 characters (tts-1) or ~$0.03 (tts-1-hd).
 * A typical 30-second voiceover (~400 chars) costs ~$0.006-$0.012.
 */

import { uploadBufferToS3, isS3Configured } from "../utils/s3Upload";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

export type TTSVoice = "alloy" | "ash" | "coral" | "echo" | "fable" | "nova" | "onyx" | "sage" | "shimmer";
export type TTSModel = "tts-1" | "tts-1-hd";

interface TTSResult {
  success: boolean;
  audioUrl?: string; // S3 URL of the generated audio
  s3Key?: string; // S3 object key
  durationEstimate?: number; // Estimated duration in seconds
  error?: string;
}

/**
 * Check if TTS is available (requires OpenAI API key + S3).
 */
export function isTTSAvailable(): boolean {
  return !!OPENAI_API_KEY && isS3Configured();
}

/**
 * Generate voiceover audio from text and upload to S3.
 *
 * @param text - The voiceover script text
 * @param options - Voice, model, and file naming options
 * @returns S3 URL of the generated MP3 audio file
 */
export async function generateVoiceover(
  text: string,
  options: {
    voice?: TTSVoice;
    model?: TTSModel;
    briefId?: number;
    speed?: number; // 0.25 to 4.0, default 1.0
  } = {}
): Promise<TTSResult> {
  if (!OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY not configured" };
  }

  if (!isS3Configured()) {
    return { success: false, error: "S3 not configured — audio needs a public URL for Shotstack" };
  }

  if (!text || text.trim().length === 0) {
    return { success: false, error: "No voiceover text provided" };
  }

  const {
    voice = "nova", // Nova is energetic and professional — good for marketing
    model = "tts-1-hd",
    briefId,
    speed = 1.0,
  } = options;

  try {
    console.log(`[TTS] Generating voiceover (${text.length} chars, voice=${voice}, model=${model})...`);

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice,
        input: text,
        response_format: "mp3",
        speed,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TTS] OpenAI TTS failed (${response.status}): ${errorText}`);
      return { success: false, error: `TTS API error: ${response.status}` };
    }

    // Get the audio data as a buffer
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    console.log(`[TTS] Audio generated: ${(audioBuffer.length / 1024).toFixed(1)} KB`);

    // Upload to S3
    const timestamp = Date.now();
    const s3Key = `social-media/voiceovers/${briefId ? `brief-${briefId}` : "general"}/${timestamp}-${voice}.mp3`;
    const audioUrl = await uploadBufferToS3(audioBuffer, s3Key, "audio/mpeg");

    console.log(`[TTS] Uploaded to S3: ${audioUrl}`);

    // Estimate duration: ~150 words per minute for TTS, ~5 chars per word
    const wordCount = text.split(/\s+/).length;
    const durationEstimate = Math.ceil((wordCount / 150) * 60 / speed);

    return {
      success: true,
      audioUrl,
      s3Key,
      durationEstimate,
    };
  } catch (error: any) {
    console.error("[TTS] Error generating voiceover:", error);
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * Available voices with their characteristics for the UI.
 */
export const VOICE_OPTIONS: Array<{ id: TTSVoice; name: string; description: string }> = [
  { id: "nova", name: "Nova", description: "Energetic, professional — great for marketing" },
  { id: "alloy", name: "Alloy", description: "Balanced, neutral — versatile" },
  { id: "echo", name: "Echo", description: "Warm, authoritative — good for explainers" },
  { id: "fable", name: "Fable", description: "Expressive, storytelling — good for narratives" },
  { id: "onyx", name: "Onyx", description: "Deep, confident — good for bold statements" },
  { id: "shimmer", name: "Shimmer", description: "Bright, friendly — good for upbeat content" },
  { id: "coral", name: "Coral", description: "Warm, conversational — good for testimonials" },
  { id: "sage", name: "Sage", description: "Calm, knowledgeable — good for educational" },
  { id: "ash", name: "Ash", description: "Smooth, modern — good for tech/SaaS" },
];
