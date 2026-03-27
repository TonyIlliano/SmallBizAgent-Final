/**
 * Video Assembly Service
 *
 * Takes a Video Brief and assembles a multi-track Shotstack timeline
 * from pre-recorded screen clips (S3), Pexels stock b-roll, OpenAI TTS
 * voiceover, and text overlays. Renders to MP4 via Shotstack Edit API.
 *
 * Pipeline:
 * 1. Parse brief's screen_sequence → map to clip library entries
 * 2. Fetch stock b-roll from Pexels using brief's stock_search_terms
 * 3. Generate voiceover audio from brief's voiceover script via OpenAI TTS
 * 4. Build multi-track Shotstack timeline:
 *    - Track 0 (top): Text overlays (hook, CTA, captions)
 *    - Track 1: Screen recording clips (from clip library on S3)
 *    - Track 2: Stock b-roll footage (from Pexels)
 *    - Track 3 (bottom): Background gradient/color
 *    - Soundtrack: Voiceover audio (from S3)
 * 5. Submit to Shotstack → poll → upload final video to S3
 */

import { db } from "../db";
import { videoBriefs, videoClips } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { findBRollForTerms, isPexelsConfigured } from "./pexelsService";
import { generateVoiceover, isTTSAvailable, type TTSVoice } from "./ttsService";
import { uploadUrlToS3, isS3Configured } from "../utils/s3Upload";
import OpenAI from "openai";

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || "";
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || "v1";
const SHOTSTACK_BASE = `https://api.shotstack.io/${SHOTSTACK_ENV}`;
const BRAND_URL = (process.env.APP_URL || "https://www.smallbizagent.ai").replace(/^https?:\/\/(www\.)?/, "");

// ── Types ───────────────────────────────────────────────────────────────

interface BriefData {
  hook: string;
  voiceover: string | null;
  screen_sequence: Array<{ duration: string; clip: string; note?: string }>;
  broll: string;
  caption: string;
  hashtags: string[];
  cta_overlay: string;
  boost_targeting: string;
  boost_budget: string;
  stock_search_terms: string[];
  estimated_duration?: number;
}

interface AssemblyResult {
  success: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  renderId?: string;
  error?: string;
}

interface ClipMatch {
  clipUrl: string;
  durationSeconds: number;
  name: string;
}

// Category keyword map for matching brief screen_sequence clips to library
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  dashboard: ["dashboard", "overview", "home", "stats", "analytics", "metrics", "kpi"],
  calls: ["call", "phone", "incoming", "ringing", "receptionist", "ai answer", "voice"],
  calendar: ["calendar", "appointment", "booking", "schedule", "availability", "slot"],
  sms: ["sms", "text", "message", "notification", "follow-up", "reminder", "chat"],
  invoice: ["invoice", "payment", "billing", "charge", "receipt", "pay"],
  crm: ["crm", "customer", "contact", "client", "lead", "profile"],
  agents: ["agent", "automation", "bot", "automated", "ai agent", "workflow"],
  general: ["general", "feature", "platform", "software", "app", "tool"],
};

// ── Main Assembly Function ──────────────────────────────────────────────

/**
 * Render a video from a brief. This is the main entry point.
 *
 * @param briefId - ID of the video brief to render
 * @param options - Rendering options
 * @returns Rendered video URL and metadata
 */
export async function renderVideoFromBrief(
  briefId: number,
  options: {
    aspectRatio?: "9:16" | "16:9";
    voice?: TTSVoice;
  } = {}
): Promise<AssemblyResult> {
  const { aspectRatio = "9:16", voice = "nova" } = options;

  if (!SHOTSTACK_API_KEY) {
    return { success: false, error: "SHOTSTACK_API_KEY not configured" };
  }

  // 1. Load the brief
  const [brief] = await db.select().from(videoBriefs).where(eq(videoBriefs.id, briefId)).limit(1);
  if (!brief) {
    return { success: false, error: "Brief not found" };
  }

  const briefData = brief.briefData as BriefData;
  if (!briefData || !briefData.screen_sequence) {
    return { success: false, error: "Brief has no screen_sequence data" };
  }

  // Mark as rendering
  await db.update(videoBriefs).set({
    renderStatus: "rendering",
    aspectRatio,
    renderError: null,
  }).where(eq(videoBriefs.id, briefId));

  try {
    console.log(`[VideoAssembly] Starting render for brief #${briefId} (${aspectRatio})...`);

    // 2. Parallel: fetch clips, search b-roll, generate voiceover
    const isVertical = aspectRatio === "9:16";
    const width = isVertical ? 1080 : 1920;
    const height = isVertical ? 1920 : 1080;

    const [clipMatches, brollMap, voiceoverResult] = await Promise.all([
      // Match brief screen sequences to clip library
      matchClipsToSequence(briefData.screen_sequence),
      // Fetch stock b-roll from Pexels
      isPexelsConfigured() && briefData.stock_search_terms?.length > 0
        ? findBRollForTerms(briefData.stock_search_terms, isVertical ? "portrait" : "landscape")
        : Promise.resolve(new Map()),
      // Generate voiceover
      isTTSAvailable() && briefData.voiceover
        ? generateVoiceover(briefData.voiceover, { voice, briefId })
        : Promise.resolve(null),
    ]);

    // Save voiceover URL to brief if generated
    if (voiceoverResult?.success && voiceoverResult.audioUrl) {
      await db.update(videoBriefs).set({
        voiceoverUrl: voiceoverResult.audioUrl,
      }).where(eq(videoBriefs.id, briefId));
    }

    console.log(`[VideoAssembly] Assets: ${clipMatches.length} clips, ${brollMap.size} b-roll, voiceover=${voiceoverResult?.success || false}`);

    // 2.5. Word-sync: map voiceover words to scenes for precise cut timing
    let wordSyncDurations: number[] | null = null;
    if (briefData.voiceover && voiceoverResult?.success) {
      wordSyncDurations = await mapWordsToScenes(briefData.voiceover, briefData.screen_sequence);
    }

    // 3. Build the Shotstack timeline
    const timeline = buildAssemblyTimeline({
      briefData,
      clipMatches,
      brollMap,
      voiceoverUrl: voiceoverResult?.audioUrl || null,
      voiceoverDuration: voiceoverResult?.durationEstimate || null,
      isVertical,
      width,
      height,
      wordSyncDurations,
    });

    // 4. Submit to Shotstack
    const renderId = await submitRender(timeline);
    console.log(`[VideoAssembly] Render submitted: ${renderId}`);

    // Save render ID
    await db.update(videoBriefs).set({ renderId }).where(eq(videoBriefs.id, briefId));

    // 5. Poll for completion (max 5 minutes)
    const result = await waitForRender(renderId, 300000);

    if (!result.url) {
      const error = result.error || "Render completed without URL";
      await db.update(videoBriefs).set({
        renderStatus: "failed",
        renderError: error,
      }).where(eq(videoBriefs.id, briefId));
      return { success: false, error, renderId };
    }

    // 6. Upload to S3
    let finalVideoUrl = result.url;
    let finalThumbnailUrl = result.thumbnail;

    if (isS3Configured()) {
      try {
        const timestamp = Date.now();
        const videoKey = `social-media/assembled-videos/brief-${briefId}/${timestamp}.mp4`;
        finalVideoUrl = await uploadUrlToS3(result.url, videoKey, "video/mp4");

        if (result.thumbnail) {
          const thumbKey = `social-media/assembled-videos/brief-${briefId}/${timestamp}-thumb.jpg`;
          finalThumbnailUrl = await uploadUrlToS3(result.thumbnail, thumbKey, "image/jpeg");
        }

        console.log(`[VideoAssembly] Uploaded to S3: ${finalVideoUrl}`);
      } catch (s3Error) {
        console.error("[VideoAssembly] S3 upload failed, using Shotstack CDN:", s3Error);
      }
    }

    // 7. Update brief with final URLs
    await db.update(videoBriefs).set({
      renderStatus: "done",
      videoUrl: finalVideoUrl,
      thumbnailUrl: finalThumbnailUrl || null,
      renderedAt: new Date(),
      renderError: null,
    }).where(eq(videoBriefs.id, briefId));

    console.log(`[VideoAssembly] ✅ Brief #${briefId} rendered successfully: ${finalVideoUrl}`);

    return {
      success: true,
      videoUrl: finalVideoUrl,
      thumbnailUrl: finalThumbnailUrl,
      renderId,
    };
  } catch (error: any) {
    console.error(`[VideoAssembly] ❌ Brief #${briefId} render failed:`, error);

    await db.update(videoBriefs).set({
      renderStatus: "failed",
      renderError: error.message || String(error),
    }).where(eq(videoBriefs.id, briefId));

    return { success: false, error: error.message || String(error) };
  }
}

// ── Clip Matching ───────────────────────────────────────────────────────

/**
 * Match brief screen_sequence entries to clips in the library.
 * Uses keyword matching on clip name, description, category, and tags.
 */
async function matchClipsToSequence(
  sequence: BriefData["screen_sequence"]
): Promise<ClipMatch[]> {
  // Fetch all clips from the library
  const allClips = await db.select().from(videoClips).orderBy(videoClips.sortOrder);

  if (allClips.length === 0) {
    console.warn("[VideoAssembly] No clips in library — will use text overlays only");
    return [];
  }

  const matches: ClipMatch[] = [];

  for (const scene of sequence) {
    const sceneText = `${scene.clip} ${scene.note || ""}`.toLowerCase();

    // Score each clip against this scene
    let bestClip = allClips[0];
    let bestScore = 0;

    for (const clip of allClips) {
      let score = 0;
      const clipText = `${clip.name} ${clip.description || ""} ${clip.category}`.toLowerCase();
      const clipTags = (clip.tags as string[] || []).map((t: string) => t.toLowerCase());

      // Category keyword match
      for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (clip.category === category) {
          for (const kw of keywords) {
            if (sceneText.includes(kw)) score += 3;
          }
        }
      }

      // Direct text overlap
      const sceneWords = sceneText.split(/\s+/);
      for (const word of sceneWords) {
        if (word.length < 3) continue;
        if (clipText.includes(word)) score += 2;
        if (clipTags.some((t: string) => t.includes(word))) score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestClip = clip;
      }
    }

    // Parse duration from scene (e.g., "5 sec" → 5)
    const durationMatch = scene.duration.match(/(\d+)/);
    const duration = durationMatch ? parseInt(durationMatch[1]) : 5;

    matches.push({
      clipUrl: bestClip.s3Url,
      durationSeconds: Math.min(duration, bestClip.durationSeconds || duration),
      name: bestClip.name,
    });
  }

  return matches;
}

// ── Voiceover-to-Scene Word Sync ────────────────────────────────────────

/**
 * Uses GPT to map voiceover words to screen_sequence scenes so visual cuts
 * happen exactly when the topic changes in the narration.
 * Returns per-scene word counts for proportional timing.
 * Falls back to even distribution on any error.
 */
async function mapWordsToScenes(
  voiceoverText: string,
  screenSequence: Array<{ duration: string; clip: string; note?: string }>
): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY || !voiceoverText || screenSequence.length === 0) {
    return null;
  }

  try {
    const openai = new OpenAI();
    const sceneLabels = screenSequence.map((s, i) =>
      `Scene ${i}: ${s.clip}${s.note ? " — " + s.note : ""}`
    ).join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a video editor. Given a voiceover script and visual scenes, split the script into segments — one per scene. Each word must be assigned to exactly one scene in order. Return JSON: { "segments": [{ "sceneIndex": 0, "words": "exact words for this scene" }, ...] }. Every scene must have at least one word. Preserve word order — no skipping or repeating.`,
        },
        {
          role: "user",
          content: `VOICEOVER SCRIPT:\n"${voiceoverText}"\n\nSCENES:\n${sceneLabels}\n\nSplit the voiceover into ${screenSequence.length} segments matching the scenes above.`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const segments = parsed.segments;
    if (!Array.isArray(segments) || segments.length !== screenSequence.length) return null;

    // Convert to word counts per scene
    const wordCounts = segments.map((s: { words: string }) => {
      const words = s.words?.trim().split(/\s+/).filter(Boolean);
      return words ? words.length : 1;
    });

    // Validate: every scene must have at least 1 word
    if (wordCounts.some((c: number) => c < 1)) return null;

    console.log(`[VideoAssembly] Word sync: ${wordCounts.join(", ")} words per scene`);
    return wordCounts;
  } catch (err) {
    console.warn("[VideoAssembly] Word sync failed (using even distribution):", err);
    return null;
  }
}

// ── Timeline Builder ────────────────────────────────────────────────────

function buildAssemblyTimeline(params: {
  briefData: BriefData;
  clipMatches: ClipMatch[];
  brollMap: Map<string, { url: string; duration: number; thumbnailUrl: string }>;
  voiceoverUrl: string | null;
  voiceoverDuration: number | null;
  isVertical: boolean;
  width: number;
  height: number;
  wordSyncDurations?: number[] | null;
}): any {
  const { briefData, clipMatches, brollMap, voiceoverUrl, voiceoverDuration, isVertical, width, height, wordSyncDurations } = params;

  // Calculate total duration from screen sequence
  let totalDuration = briefData.estimated_duration || 0;
  if (totalDuration === 0) {
    for (const scene of briefData.screen_sequence) {
      const match = scene.duration.match(/(\d+)/);
      totalDuration += match ? parseInt(match[1]) : 5;
    }
  }
  totalDuration = Math.max(totalDuration, 15); // Minimum 15 seconds
  totalDuration = Math.min(totalDuration, 60); // Maximum 60 seconds

  const hookDuration = 3; // Hook text visible for 3 seconds
  const ctaDuration = 4; // CTA visible at the end
  const contentDuration = totalDuration - hookDuration - ctaDuration;

  // Pre-compute scene durations (word-sync or raw)
  const sceneDurations: number[] = [];
  if (wordSyncDurations && wordSyncDurations.length === briefData.screen_sequence.length) {
    // Use word-count ratios to distribute content duration
    const totalWords = wordSyncDurations.reduce((a, b) => a + b, 0);
    for (const wc of wordSyncDurations) {
      const ratio = totalWords > 0 ? wc / totalWords : 1 / wordSyncDurations.length;
      sceneDurations.push(Math.max(2, Math.round(contentDuration * ratio * 10) / 10));
    }
    console.log(`[VideoAssembly] Word-synced scene durations: ${sceneDurations.map(d => d + "s").join(", ")}`);
  } else {
    // Fall back to raw durations from brief
    for (const scene of briefData.screen_sequence) {
      const match = scene.duration.match(/(\d+)/);
      sceneDurations.push(match ? parseInt(match[1]) : 5);
    }
  }

  const tracks: any[] = [];

  // ── Track: Text Overlays (topmost layer) ──────────────────────────

  const textTrack: any = { clips: [] };

  // Hook text (first 3 seconds)
  if (briefData.hook) {
    textTrack.clips.push({
      asset: {
        type: "html",
        html: buildHookHtml(briefData.hook, isVertical),
        width,
        height: isVertical ? 600 : 300,
      },
      start: 0,
      length: hookDuration,
      position: isVertical ? "top" : "top",
      offset: { y: isVertical ? 0.15 : 0.08 },
      transition: { in: "fade", out: "fade" },
    });
  }

  // CTA overlay (last 4 seconds)
  if (briefData.cta_overlay) {
    textTrack.clips.push({
      asset: {
        type: "html",
        html: buildCtaHtml(briefData.cta_overlay, isVertical),
        width,
        height: isVertical ? 500 : 300,
      },
      start: totalDuration - ctaDuration,
      length: ctaDuration,
      position: "center",
      transition: { in: "slideUp" },
    });
  }

  tracks.push(textTrack);

  // ── Track: Scene labels (describing what's on screen) ─────────────

  const labelTrack: any = { clips: [] };
  let sceneStart = hookDuration;

  for (let i = 0; i < briefData.screen_sequence.length; i++) {
    const scene = briefData.screen_sequence[i];
    const sceneDuration = sceneDurations[i] || 5;

    // Only add label if it's short enough to be a caption
    if (scene.note && scene.note.length < 80) {
      labelTrack.clips.push({
        asset: {
          type: "html",
          html: buildLabelHtml(scene.note, isVertical),
          width: isVertical ? 1000 : 1600,
          height: isVertical ? 120 : 80,
        },
        start: sceneStart,
        length: Math.min(sceneDuration, totalDuration - sceneStart - ctaDuration),
        position: "bottom",
        offset: { y: isVertical ? -0.2 : -0.12 },
        transition: { in: "fade", out: "fade" },
      });
    }

    sceneStart += sceneDuration;
    if (sceneStart >= totalDuration - ctaDuration) break;
  }

  if (labelTrack.clips.length > 0) {
    tracks.push(labelTrack);
  }

  // ── Track: Screen recording clips (from library) ──────────────────

  if (clipMatches.length > 0) {
    const clipTrack: any = { clips: [] };
    let clipStart = hookDuration;

    for (let i = 0; i < clipMatches.length; i++) {
      const clip = clipMatches[i];
      const sceneDuration = sceneDurations[i] || 5;

      if (clipStart >= totalDuration - ctaDuration) break;

      const clampedDuration = Math.min(sceneDuration, totalDuration - clipStart - ctaDuration);

      clipTrack.clips.push({
        asset: {
          type: "video",
          src: clip.clipUrl,
          trim: 0, // Start from beginning of clip
          volume: 0, // Mute screen recordings (voiceover provides audio)
        },
        start: clipStart,
        length: clampedDuration,
        fit: "contain", // Letterbox to fit without distortion
        position: "center",
        transition: i > 0 ? { in: "fade" } : undefined,
      });

      clipStart += clampedDuration;
    }

    if (clipTrack.clips.length > 0) {
      tracks.push(clipTrack);
    }
  }

  // ── Track: B-roll stock footage (from Pexels) ─────────────────────

  if (brollMap.size > 0) {
    const brollTrack: any = { clips: [] };
    const brollEntries = Array.from(brollMap.values());

    // If we have screen clips, b-roll goes in gaps or at hook/CTA.
    // If no screen clips, b-roll fills the entire video.
    if (clipMatches.length === 0) {
      // B-roll fills entire video
      let brollStart = 0;
      for (let i = 0; i < brollEntries.length && brollStart < totalDuration; i++) {
        const entry = brollEntries[i];
        const dur = Math.min(entry.duration, totalDuration - brollStart, 10);

        brollTrack.clips.push({
          asset: {
            type: "video",
            src: entry.url,
            trim: 0,
            volume: 0,
          },
          start: brollStart,
          length: dur,
          fit: "cover",
          transition: i > 0 ? { in: "fade" } : undefined,
        });

        brollStart += dur;
      }
    } else {
      // B-roll during hook and CTA sections
      if (brollEntries.length > 0) {
        const hookBroll = brollEntries[0];
        brollTrack.clips.push({
          asset: {
            type: "video",
            src: hookBroll.url,
            trim: 0,
            volume: 0,
          },
          start: 0,
          length: hookDuration,
          fit: "cover",
          opacity: 0.4, // Semi-transparent behind hook text
        });
      }

      if (brollEntries.length > 1) {
        const ctaBroll = brollEntries[1];
        brollTrack.clips.push({
          asset: {
            type: "video",
            src: ctaBroll.url,
            trim: 0,
            volume: 0,
          },
          start: totalDuration - ctaDuration,
          length: ctaDuration,
          fit: "cover",
          opacity: 0.3,
          transition: { in: "fade" },
        });
      }
    }

    if (brollTrack.clips.length > 0) {
      tracks.push(brollTrack);
    }
  }

  // ── Track: Background (bottommost layer) ──────────────────────────

  tracks.push({
    clips: [
      {
        asset: {
          type: "html",
          html: `<div style="width:100%;height:100%;background:linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #172554 100%)"></div>`,
          width,
          height,
        },
        start: 0,
        length: totalDuration,
      },
    ],
  });

  // ── Build the final payload ───────────────────────────────────────

  const payload: any = {
    timeline: {
      background: "#000000",
      tracks,
    },
    output: {
      format: "mp4",
      resolution: isVertical ? "1080" : "hd",
      aspectRatio: isVertical ? "9:16" : "16:9",
      size: { width, height },
      fps: 25,
    },
  };

  // Add voiceover as soundtrack if available
  if (voiceoverUrl) {
    payload.timeline.soundtrack = {
      src: voiceoverUrl,
      effect: "fadeOut",
      volume: 1,
    };
  }

  return payload;
}

// ── HTML Builders ───────────────────────────────────────────────────────

function buildHookHtml(hook: string, isVertical: boolean): string {
  const fontSize = isVertical ? 52 : 64;
  return `<div style="font-family:'Inter',Arial,sans-serif;text-align:center;padding:40px 30px;color:white">
    <h1 style="font-size:${fontSize}px;font-weight:800;line-height:1.2;text-shadow:0 4px 20px rgba(0,0,0,0.5)">${escapeHtml(hook)}</h1>
  </div>`;
}

function buildCtaHtml(ctaText: string, isVertical: boolean): string {
  const fontSize = isVertical ? 40 : 48;
  const subFontSize = isVertical ? 24 : 28;
  return `<div style="font-family:'Inter',Arial,sans-serif;text-align:center;padding:40px 30px;color:white">
    <p style="font-size:${fontSize}px;font-weight:700;margin-bottom:16px;text-shadow:0 2px 10px rgba(0,0,0,0.5)">${escapeHtml(ctaText)}</p>
    <p style="font-size:${subFontSize}px;opacity:0.9;background:rgba(37,99,235,0.8);display:inline-block;padding:12px 32px;border-radius:50px;font-weight:600">${BRAND_URL}</p>
  </div>`;
}

function buildLabelHtml(label: string, isVertical: boolean): string {
  const fontSize = isVertical ? 22 : 20;
  return `<div style="font-family:'Inter',Arial,sans-serif;text-align:center;padding:8px 20px">
    <p style="font-size:${fontSize}px;color:white;background:rgba(0,0,0,0.6);display:inline-block;padding:6px 16px;border-radius:8px">${escapeHtml(label)}</p>
  </div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── Shotstack Render ────────────────────────────────────────────────────

async function submitRender(payload: any): Promise<string> {
  const response = await fetch(`${SHOTSTACK_BASE}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": SHOTSTACK_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shotstack render submission failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as any;
  return data.response.id;
}

async function waitForRender(renderId: string, timeoutMs: number = 300000): Promise<{
  url?: string;
  thumbnail?: string;
  error?: string;
}> {
  const startTime = Date.now();
  const pollInterval = 5000;

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(`${SHOTSTACK_BASE}/render/${renderId}`, {
      headers: { "x-api-key": SHOTSTACK_API_KEY },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Shotstack status check failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as any;
    const r = data.response;

    if (r.status === "done") {
      return { url: r.url, thumbnail: r.thumbnail };
    }

    if (r.status === "failed") {
      return { error: r.error || "Render failed" };
    }

    console.log(`[VideoAssembly] Render ${renderId}: ${r.status}...`);
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return { error: `Render timed out after ${timeoutMs / 1000}s` };
}

// ── Public Utilities ────────────────────────────────────────────────────

/**
 * Check if video assembly is available (requires Shotstack at minimum).
 */
export function isVideoAssemblyAvailable(): boolean {
  return !!SHOTSTACK_API_KEY;
}

/**
 * Get the render status for a brief.
 */
export async function getBriefRenderStatus(briefId: number): Promise<{
  status: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
} | null> {
  const [brief] = await db.select().from(videoBriefs).where(eq(videoBriefs.id, briefId)).limit(1);
  if (!brief) return null;

  return {
    status: brief.renderStatus || "none",
    videoUrl: brief.videoUrl || undefined,
    thumbnailUrl: brief.thumbnailUrl || undefined,
    error: brief.renderError || undefined,
  };
}
