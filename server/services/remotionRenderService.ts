/**
 * Remotion Render Service
 *
 * Replaces videoAssemblyService.ts — same API contract but uses Remotion
 * for server-side rendering instead of Shotstack. No external render API
 * key required. Renders MP4 locally via headless Chromium.
 *
 * Pipeline:
 * 1. Parse brief's screen_sequence -> match to clip library entries
 * 2. Fetch stock b-roll from Pexels using brief's stock_search_terms
 * 3. Generate voiceover audio from brief's voiceover script via OpenAI TTS
 * 4. Map voiceover words to scenes via GPT for precise cut timing
 * 5. Calculate scene timings from word-count ratios
 * 6. Build AdVideoProps (JSON-serializable input for Remotion composition)
 * 7. selectComposition("AdVideo") + renderMedia() -> /tmp MP4
 * 8. Upload to S3 -> update DB -> return result
 *
 * Bundle is cached after first init — subsequent renders skip the
 * webpack step entirely.
 */

import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import OpenAI from "openai";
import { db } from "../db";
import { videoBriefs, videoClips } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { findBRollForTerms, isPexelsConfigured } from "./pexelsService";
import { generateVoiceover, isTTSAvailable, type TTSVoice } from "./ttsService";
import { uploadBufferToS3, isS3Configured } from "../utils/s3Upload";

// ── Constants ───────────────────────────────────────────────────────────

const FPS = 30;
const BRAND_URL = (process.env.APP_URL || "https://www.smallbizagent.ai").replace(/^https?:\/\/(www\.)?/, "");
const LOGO_URL = "https://smallbizagent-media.s3.us-east-1.amazonaws.com/branding/logo.png";
const REMOTION_ENTRY = path.resolve(process.cwd(), "remotion/index.ts");

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
  durationSec: number;
  name: string;
}

interface ScreenSequenceItem {
  description: string;
  durationSec: number;
  clipUrl: string | null;
}

interface BRollClip {
  url: string;
  durationSec: number;
  startFrame?: number;
}

interface AdVideoProps {
  hook: string;
  voiceoverUrl: string | null;
  backgroundMusicUrl: string | null;
  voiceoverDurationSec: number;
  screenSequence: ScreenSequenceItem[];
  brollClips: BRollClip[];
  ctaOverlay: string;
  aspectRatio: "9:16" | "16:9";
  totalDurationFrames: number;
  brandUrl: string;
  logoUrl: string | null;
  stats: null;
}

interface SceneWordMapping {
  sceneIndex: number;
  words: string;
  wordCount: number;
}

// ── Bundle Cache ────────────────────────────────────────────────────────

let bundleLocation: string | null = null;
let bundlePromise: Promise<string | null> | null = null;

/**
 * Pre-bundle the Remotion project once at server startup.
 * Non-blocking — logs errors but never crashes the server.
 * Subsequent calls return the cached bundle path instantly.
 */
export async function initRemotionBundle(): Promise<void> {
  if (bundleLocation) return;
  if (bundlePromise) {
    await bundlePromise;
    return;
  }

  bundlePromise = (async (): Promise<string | null> => {
    try {
      console.log("[RemotionRender] Bundling Remotion project...");
      const startMs = performance.now();

      const { bundle } = await import("@remotion/bundler");

      const result = await bundle({
        entryPoint: REMOTION_ENTRY,
        onProgress: (progress: number) => {
          if (progress === 100) {
            const elapsed = Math.round(performance.now() - startMs);
            console.log("[RemotionRender] Bundle complete (" + elapsed + "ms)");
          }
        },
      });

      bundleLocation = result;
      console.log("[RemotionRender] Bundle cached at: " + result);
      return result;
    } catch (error: any) {
      console.error(
        "[RemotionRender] Bundle failed (server continues without video rendering):",
        error.message || error
      );
      bundleLocation = null;
      return null;
    }
  })();

  await bundlePromise;
}

/**
 * Ensure the bundle is ready, triggering a build if needed.
 * Returns the bundle path or throws if bundling fails.
 */
async function ensureBundle(): Promise<string> {
  if (bundleLocation) return bundleLocation;

  // Reset promise so we can retry if previous attempt failed
  bundlePromise = null;
  await initRemotionBundle();

  if (!bundleLocation) {
    throw new Error(
      "Remotion bundle is not available. Check server logs for bundling errors."
    );
  }

  return bundleLocation;
}

// ── Scene-Word Sync ─────────────────────────────────────────────────────

/**
 * Use OpenAI to map voiceover words to screen_sequence scenes for
 * precise cut timing. Each word of the voiceover is assigned to exactly
 * one scene so that visual cuts align with the narration.
 *
 * Falls back to even word distribution if the GPT call fails.
 *
 * @param voiceoverText  Full voiceover script text
 * @param screenSequence Scene labels from the brief
 * @returns Array of mappings: sceneIndex, words, wordCount
 */
async function mapWordsToScenes(
  voiceoverText: string,
  screenSequence: Array<{ durationSec: number; clip: string; note: string }>
): Promise<SceneWordMapping[]> {
  const totalWords = voiceoverText.split(/\s+/).filter(Boolean);
  const sceneCount = screenSequence.length;

  // If there are no words or no scenes, return empty
  if (totalWords.length === 0 || sceneCount === 0) {
    return [];
  }

  // Build scene labels for the prompt
  const sceneLabels = screenSequence.map((s, i) =>
    `Scene ${i}: "${s.clip}" – ${s.note || "no description"} (${s.durationSec}s)`
  );

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[RemotionRender] No OPENAI_API_KEY — falling back to even word distribution");
    return evenWordDistribution(voiceoverText, sceneCount);
  }

  try {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a video editor. Given a voiceover script and a list of visual scenes, " +
            "split the script into segments that match each scene. Each word of the script " +
            "must be assigned to exactly one scene. The words must stay in their original order " +
            "and no words may be skipped or repeated. Return a JSON object with a single key " +
            '"segments" containing an array where each entry has "sceneIndex" (0-based integer) ' +
            'and "words" (the exact substring of the voiceover for that scene). Every scene must ' +
            "have at least one word assigned to it.",
        },
        {
          role: "user",
          content:
            "VOICEOVER SCRIPT:\n" +
            voiceoverText +
            "\n\nSCENES:\n" +
            sceneLabels.join("\n") +
            "\n\nSplit the voiceover into " +
            sceneCount +
            " segments, one per scene. " +
            "Assign more words to scenes that need more narration based on their visual content. " +
            "Return JSON: { segments: [{ sceneIndex, words }] }",
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      console.warn("[RemotionRender] GPT returned empty response — falling back to even distribution");
      return evenWordDistribution(voiceoverText, sceneCount);
    }

    const parsed = JSON.parse(content);
    const segments: Array<{ sceneIndex: number; words: string }> = parsed.segments;

    if (!Array.isArray(segments) || segments.length === 0) {
      console.warn("[RemotionRender] GPT returned invalid segments — falling back to even distribution");
      return evenWordDistribution(voiceoverText, sceneCount);
    }

    // Validate: every scene index must be present and in range
    const seenIndices = new Set(segments.map((s) => s.sceneIndex));
    for (let i = 0; i < sceneCount; i++) {
      if (!seenIndices.has(i)) {
        console.warn(
          "[RemotionRender] GPT skipped scene " + i + " — falling back to even distribution"
        );
        return evenWordDistribution(voiceoverText, sceneCount);
      }
    }

    // Calculate word counts and build result
    const result: SceneWordMapping[] = segments.map((seg) => ({
      sceneIndex: seg.sceneIndex,
      words: seg.words,
      wordCount: seg.words.split(/\s+/).filter(Boolean).length,
    }));

    // Ensure every segment has at least 1 word
    const allHaveWords = result.every((r) => r.wordCount > 0);
    if (!allHaveWords) {
      console.warn("[RemotionRender] GPT assigned 0 words to a scene — falling back to even distribution");
      return evenWordDistribution(voiceoverText, sceneCount);
    }

    const mappedWordCount = result.reduce((sum, r) => sum + r.wordCount, 0);
    console.log(
      "[RemotionRender] Scene-word sync: " + mappedWordCount + " words mapped across " +
      result.length + " scenes via GPT"
    );

    return result;
  } catch (error: any) {
    console.warn(
      "[RemotionRender] GPT scene-word mapping failed (" +
      (error.message || error) + ") — falling back to even distribution"
    );
    return evenWordDistribution(voiceoverText, sceneCount);
  }
}

/**
 * Fallback: distribute voiceover words evenly across scenes.
 * Each scene gets approximately the same number of words.
 */
function evenWordDistribution(
  voiceoverText: string,
  sceneCount: number
): SceneWordMapping[] {
  const words = voiceoverText.split(/\s+/).filter(Boolean);
  if (words.length === 0 || sceneCount === 0) return [];

  const wordsPerScene = Math.floor(words.length / sceneCount);
  const remainder = words.length % sceneCount;
  const result: SceneWordMapping[] = [];
  let offset = 0;

  for (let i = 0; i < sceneCount; i++) {
    // Distribute remainder words to earlier scenes (1 extra each)
    const count = wordsPerScene + (i < remainder ? 1 : 0);
    const segmentWords = words.slice(offset, offset + count).join(" ");

    result.push({
      sceneIndex: i,
      words: segmentWords,
      wordCount: count,
    });

    offset += count;
  }

  return result;
}

// ── Main Render Function ────────────────────────────────────────────────

/**
 * Render a video from a brief using Remotion.
 * Same API contract as videoAssemblyService.renderVideoFromBrief().
 *
 * @param briefId - ID of the video brief to render
 * @param options - Rendering options (aspect ratio, TTS voice)
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

  // 1. Load the brief
  const [brief] = await db
    .select()
    .from(videoBriefs)
    .where(eq(videoBriefs.id, briefId))
    .limit(1);

  if (!brief) {
    return { success: false, error: "Brief not found" };
  }

  const briefData = brief.briefData as BriefData;
  if (!briefData || !briefData.screen_sequence) {
    return { success: false, error: "Brief has no screen_sequence data" };
  }

  // Mark as rendering
  await db
    .update(videoBriefs)
    .set({
      renderStatus: "rendering",
      aspectRatio,
      renderError: null,
    })
    .where(eq(videoBriefs.id, briefId));

  const renderId = randomUUID();
  const tmpPath = path.join("/tmp", "remotion-" + renderId + ".mp4");

  try {
    console.log(
      "[RemotionRender] Starting render for brief #" + briefId + " (" + aspectRatio + ")..."
    );

    const isVertical = aspectRatio === "9:16";

    // 2. Parallel asset fetch: clips, b-roll, voiceover
    const [clipMatches, brollMap, voiceoverResult] = await Promise.all([
      matchClipsToSequence(briefData.screen_sequence),
      isPexelsConfigured() && briefData.stock_search_terms?.length > 0
        ? findBRollForTerms(
            briefData.stock_search_terms,
            isVertical ? "portrait" : "landscape"
          )
        : Promise.resolve(
            new Map<string, { url: string; duration: number; thumbnailUrl: string }>()
          ),
      isTTSAvailable() && briefData.voiceover
        ? generateVoiceover(briefData.voiceover, { voice, briefId })
        : Promise.resolve(null),
    ]);

    // Persist voiceover URL if generated
    const voiceoverUrl =
      voiceoverResult?.success && voiceoverResult.audioUrl
        ? voiceoverResult.audioUrl
        : null;
    const voiceoverDurationSec = voiceoverResult?.durationEstimate || 0;

    if (voiceoverUrl) {
      await db
        .update(videoBriefs)
        .set({ voiceoverUrl })
        .where(eq(videoBriefs.id, briefId));
    }

    console.log(
      "[RemotionRender] Assets: " + clipMatches.length + " clips, " +
      brollMap.size + " b-roll, voiceover=" + (!!voiceoverUrl)
    );

    // 3. Scene-word sync: map voiceover words to scenes for precise cut timing
    let wordMappings: SceneWordMapping[] = [];
    if (briefData.voiceover && briefData.screen_sequence.length > 0) {
      const sequenceWithNotes = briefData.screen_sequence.map((s) => ({
        durationSec: (() => {
          const m = s.duration.match(/(\d+)/);
          return m ? parseInt(m[1]) : 5;
        })(),
        clip: s.clip,
        note: s.note || "",
      }));

      wordMappings = await mapWordsToScenes(briefData.voiceover, sequenceWithNotes);
    }

    // 4. Calculate scene timings
    const hookDurationSec = 3;
    const ctaDurationSec = 4;

    // Sum original scene durations
    let rawSequenceDuration = 0;
    for (const scene of briefData.screen_sequence) {
      const m = scene.duration.match(/(\d+)/);
      rawSequenceDuration += m ? parseInt(m[1]) : 5;
    }
    if (rawSequenceDuration === 0) {
      rawSequenceDuration = briefData.screen_sequence.length * 5;
    }

    // Use voiceover duration to drive total if it is longer than the scene sum
    let effectiveSequenceDuration = rawSequenceDuration;
    let totalDurationSec = hookDurationSec + rawSequenceDuration + ctaDurationSec;

    if (voiceoverDurationSec > totalDurationSec) {
      effectiveSequenceDuration =
        voiceoverDurationSec - hookDurationSec - ctaDurationSec;
      totalDurationSec = voiceoverDurationSec;
    }

    // Clamp to [15, 60]
    totalDurationSec = Math.max(totalDurationSec, 15);
    totalDurationSec = Math.min(totalDurationSec, 60);

    // Recalculate effective sequence duration after clamping
    effectiveSequenceDuration = totalDurationSec - hookDurationSec - ctaDurationSec;
    if (effectiveSequenceDuration < 1) effectiveSequenceDuration = 1;

    const totalDurationFrames = Math.round(totalDurationSec * FPS);

    // 5. Build screen sequence items with timing from word-count ratios
    const screenSequence: ScreenSequenceItem[] = [];

    // Determine total word count from mappings (if available)
    const totalMappedWords = wordMappings.reduce((sum, m) => sum + m.wordCount, 0);
    const useWordSync = wordMappings.length === briefData.screen_sequence.length && totalMappedWords > 0;

    if (useWordSync) {
      console.log(
        "[RemotionRender] Using word-count ratios for scene timing (" +
        totalMappedWords + " words across " + wordMappings.length + " scenes)"
      );
    }

    for (let i = 0; i < briefData.screen_sequence.length; i++) {
      const scene = briefData.screen_sequence[i];

      let sceneDur: number;

      if (useWordSync) {
        // Use word-count ratio: scene gets proportional share of content time
        const mapping = wordMappings.find((m) => m.sceneIndex === i);
        const sceneWordCount = mapping ? mapping.wordCount : 1;
        const ratio = sceneWordCount / totalMappedWords;
        sceneDur = Math.round(ratio * effectiveSequenceDuration);
      } else {
        // Fall back to original proportional scaling
        const m = scene.duration.match(/(\d+)/);
        const rawDur = m ? parseInt(m[1]) : 5;
        sceneDur =
          rawSequenceDuration > 0
            ? Math.round((rawDur / rawSequenceDuration) * effectiveSequenceDuration)
            : Math.round(
                effectiveSequenceDuration / briefData.screen_sequence.length
              );
      }

      sceneDur = Math.max(sceneDur, 2); // Minimum 2 seconds per scene

      const matchedClip = clipMatches[i] || null;

      screenSequence.push({
        description: scene.note || scene.clip || ("Scene " + (i + 1)),
        durationSec: sceneDur,
        clipUrl: matchedClip?.clipUrl || null,
      });
    }

    // 6. Build b-roll clips array
    const brollClips: BRollClip[] = [];
    let brollFrameOffset = 0;

    for (const entry of Array.from(brollMap.values())) {
      const dur = Math.min(entry.duration, 10);
      brollClips.push({
        url: entry.url,
        durationSec: dur,
        startFrame: brollFrameOffset,
      });
      brollFrameOffset += Math.round(dur * FPS);
    }

    // 7. Build the AdVideoProps object (JSON-serializable)
    const inputProps: AdVideoProps = {
      hook: briefData.hook || "Your phone is costing you money.",
      voiceoverUrl,
      backgroundMusicUrl: null, // Music files not yet added
      voiceoverDurationSec,
      screenSequence,
      brollClips,
      ctaOverlay: briefData.cta_overlay || "Get started today",
      aspectRatio,
      totalDurationFrames,
      brandUrl: BRAND_URL,
      logoUrl: LOGO_URL,
      stats: null,
    };

    // 8. Ensure Remotion bundle is ready
    const serveUrl = await ensureBundle();

    // 9. Dynamically import Remotion renderer (ESM-safe)
    const { selectComposition, renderMedia } = await import(
      "@remotion/renderer"
    );

    // 10. Select the composition with calculated metadata
    console.log(
      "[RemotionRender] Selecting composition \"AdVideo\" (" +
      totalDurationFrames + " frames @ " + FPS + "fps)..."
    );

    // Find system Chromium (installed via Dockerfile apt-get or nixpacks)
    const chromiumExecutable = await (async () => {
      // Check env var first (set in Dockerfile: CHROMIUM_PATH=/usr/bin/chromium)
      if (process.env.CHROMIUM_PATH) {
        console.log("[RemotionRender] Using CHROMIUM_PATH: " + process.env.CHROMIUM_PATH);
        return process.env.CHROMIUM_PATH;
      }
      // Try common system paths
      const paths = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"];
      try {
        const { existsSync } = await import("fs");
        for (const p of paths) {
          if (existsSync(p)) {
            console.log("[RemotionRender] Using system Chromium at: " + p);
            return p;
          }
        }
      } catch { /* fall through */ }
      console.log("[RemotionRender] No system Chromium found, using Remotion bundled browser");
      return undefined;
    })();

    const composition = await selectComposition({
      serveUrl,
      id: "AdVideo",
      inputProps: { ...inputProps } as Record<string, unknown>,
      chromiumOptions: {
        enableMultiProcessOnLinux: true,
      },
      ...(chromiumExecutable ? { browserExecutable: chromiumExecutable } : {}),
    });

    // 11. Render to MP4
    console.log("[RemotionRender] Rendering to " + tmpPath + "...");
    const renderStartMs = performance.now();
    let lastLoggedPct = 0;

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: tmpPath,
      inputProps: { ...inputProps } as Record<string, unknown>,
      concurrency: 2,
      chromiumOptions: {
        enableMultiProcessOnLinux: true,
      },
      ...(chromiumExecutable ? { browserExecutable: chromiumExecutable } : {}),
      onProgress: ({ progress }: { progress: number }) => {
        const pct = Math.round(progress * 100);
        // Log at 25% intervals to avoid noise
        if (pct >= lastLoggedPct + 25) {
          lastLoggedPct = pct;
          console.log("[RemotionRender] Brief #" + briefId + ": " + pct + "% complete");
        }
      },
    });

    const renderElapsed = ((performance.now() - renderStartMs) / 1000).toFixed(1);
    console.log("[RemotionRender] Render complete in " + renderElapsed + "s");

    // 12. Read the rendered file and upload to S3
    const mp4Buffer = await fs.promises.readFile(tmpPath);

    let finalVideoUrl: string;
    const finalThumbnailUrl: string | undefined = undefined;

    if (isS3Configured()) {
      const timestamp = Date.now();
      const s3Key = "social-media/assembled-videos/brief-" + briefId + "/" + timestamp + ".mp4";
      finalVideoUrl = await uploadBufferToS3(mp4Buffer, s3Key, "video/mp4");
      console.log("[RemotionRender] Uploaded to S3: " + finalVideoUrl);
    } else {
      throw new Error(
        "S3 not configured — rendered video needs a public URL for playback"
      );
    }

    // 13. Cleanup tmp file
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
      // Ignore cleanup errors — /tmp is ephemeral
    }

    // 14. Update brief record with final result
    await db
      .update(videoBriefs)
      .set({
        renderStatus: "done",
        renderId,
        videoUrl: finalVideoUrl,
        thumbnailUrl: finalThumbnailUrl || null,
        voiceoverUrl: voiceoverUrl || brief.voiceoverUrl || null,
        renderedAt: new Date(),
        aspectRatio,
        renderError: null,
      })
      .where(eq(videoBriefs.id, briefId));

    console.log(
      "[RemotionRender] Brief #" + briefId + " rendered successfully: " + finalVideoUrl
    );

    return {
      success: true,
      videoUrl: finalVideoUrl,
      thumbnailUrl: finalThumbnailUrl,
      renderId,
    };
  } catch (error: any) {
    console.error("[RemotionRender] Brief #" + briefId + " render failed:", error);

    // Cleanup tmp file on error
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
      // File may not exist yet — ignore
    }

    await db
      .update(videoBriefs)
      .set({
        renderStatus: "failed",
        renderId,
        renderError: error.message || String(error),
      })
      .where(eq(videoBriefs.id, briefId));

    return { success: false, error: error.message || String(error), renderId };
  }
}

// ── Clip Matching ───────────────────────────────────────────────────────

/**
 * Match brief screen_sequence entries to clips in the library.
 * Uses keyword scoring on clip name, description, category, and tags.
 * Same algorithm as videoAssemblyService.
 *
 * Scoring:
 *   +3 per category keyword match (scene text contains a keyword for the clip's category)
 *   +2 per text overlap (scene word appears in clip name/description)
 *   +2 per tag overlap (scene word appears in clip tags)
 */
async function matchClipsToSequence(
  sequence: BriefData["screen_sequence"]
): Promise<ClipMatch[]> {
  const allClips = await db
    .select()
    .from(videoClips)
    .orderBy(videoClips.sortOrder);

  if (allClips.length === 0) {
    console.warn(
      "[RemotionRender] No clips in library — scenes will use text overlays only"
    );
    return [];
  }

  const matches: ClipMatch[] = [];

  for (const scene of sequence) {
    const sceneText = (scene.clip + " " + (scene.note || "")).toLowerCase();

    let bestClip = allClips[0];
    let bestScore = 0;

    for (const clip of allClips) {
      let score = 0;
      const clipText =
        (clip.name + " " + (clip.description || "") + " " + clip.category).toLowerCase();
      const clipTags = ((clip.tags as string[]) || []).map((t: string) =>
        t.toLowerCase()
      );

      // Category keyword match (+3 per keyword hit)
      for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (clip.category === category) {
          for (const kw of keywords) {
            if (sceneText.includes(kw)) score += 3;
          }
        }
      }

      // Direct text overlap (+2 per word)
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

    // Parse duration (e.g., "5 sec" -> 5)
    const durationMatch = scene.duration.match(/(\d+)/);
    const duration = durationMatch ? parseInt(durationMatch[1]) : 5;

    matches.push({
      clipUrl: bestClip.s3Url,
      durationSec: Math.min(duration, bestClip.durationSeconds || duration),
      name: bestClip.name,
    });
  }

  return matches;
}

// ── Public Utilities ────────────────────────────────────────────────────

/**
 * Check if video assembly is available.
 * Remotion renders locally — no external API key needed.
 * Always returns true (unlike Shotstack which requires SHOTSTACK_API_KEY).
 */
export function isVideoAssemblyAvailable(): boolean {
  return true;
}

/**
 * Get the render status for a brief.
 */
export async function getBriefRenderStatus(
  briefId: number
): Promise<{
  status: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
} | null> {
  const [brief] = await db
    .select()
    .from(videoBriefs)
    .where(eq(videoBriefs.id, briefId))
    .limit(1);

  if (!brief) return null;

  return {
    status: brief.renderStatus || "none",
    videoUrl: brief.videoUrl || undefined,
    thumbnailUrl: brief.thumbnailUrl || undefined,
    error: brief.renderError || undefined,
  };
}
