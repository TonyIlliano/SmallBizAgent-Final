/**
 * Video Generation Service
 *
 * Integrates with Shotstack's Edit API to render short marketing videos
 * from JSON timeline templates. Each template generates a 15-30 second
 * branded video optimized for a specific social platform.
 *
 * Fully optional — when SHOTSTACK_API_KEY is not set, the service
 * reports itself as unavailable and all calls gracefully no-op.
 */

import { uploadUrlToS3, isS3Configured } from "../utils/s3Upload";

// ── Configuration ────────────────────────────────────────────────────────

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || "";
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || "v1"; // "v1" for production, "stage" for sandbox
const SHOTSTACK_BASE = `https://api.shotstack.io/${SHOTSTACK_ENV}`;
const BRAND_URL = (process.env.APP_URL || "https://www.smallbizagent.ai").replace(/^https?:\/\/(www\.)?/, "");

// Live platform stats used by templates
interface LiveStats {
  totalBusinesses: number;
  totalCalls: number;
  callsThisMonth: number;
  activeSubscriptions: number;
}

/**
 * Fetch real platform stats from the database for use in video templates.
 * Falls back to safe defaults if the query fails.
 */
async function fetchLiveStats(): Promise<LiveStats> {
  try {
    const { getPlatformStats } = await import("./adminService");
    const stats = await getPlatformStats();
    return {
      totalBusinesses: stats.totalBusinesses || 0,
      totalCalls: stats.totalCalls || 0,
      callsThisMonth: stats.callsThisMonth || 0,
      activeSubscriptions: stats.activeSubscriptions || 0,
    };
  } catch (err) {
    console.error("[VideoGen] Failed to fetch live stats, using defaults:", err);
    return { totalBusinesses: 0, totalCalls: 0, callsThisMonth: 0, activeSubscriptions: 0 };
  }
}

/**
 * Format a number for display in video templates (e.g. 1500 → "1,500+").
 */
function formatStat(n: number, suffix: string = "+"): string {
  if (n === 0) return "—";
  return n.toLocaleString("en-US") + suffix;
}

type SocialPlatform = "twitter" | "facebook" | "instagram" | "linkedin";
type TemplateType = "feature_highlight" | "customer_stats" | "before_after" | "testimonial_quote" | "platform_demo";

interface VideoResult {
  success: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  renderId?: string;
  duration?: number;
  template?: string;
  error?: string;
}

interface RenderStatus {
  id: string;
  status: "queued" | "fetching" | "rendering" | "saving" | "done" | "failed";
  url?: string;
  thumbnail?: string;
  error?: string;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Check if video generation is available.
 */
export function isVideoGenerationAvailable(): boolean {
  return !!SHOTSTACK_API_KEY;
}

/**
 * Generate a marketing video for a social media post.
 * Returns the S3 URL of the rendered video + thumbnail.
 */
export async function generateMarketingVideo(
  platform: SocialPlatform,
  industry: string,
  content: string
): Promise<VideoResult> {
  if (!SHOTSTACK_API_KEY) {
    return { success: false, error: "SHOTSTACK_API_KEY not configured" };
  }

  try {
    // Pick a random template type
    const templateTypes: TemplateType[] = [
      "feature_highlight",
      "customer_stats",
      "before_after",
      "testimonial_quote",
      "platform_demo",
    ];
    const template = templateTypes[Math.floor(Math.random() * templateTypes.length)];

    console.log(`[VideoGen] Generating ${template} video for ${platform} (${industry})...`);

    // Fetch real platform stats for templates
    const liveStats = await fetchLiveStats();
    console.log(`[VideoGen] Live stats: ${liveStats.totalBusinesses} businesses, ${liveStats.totalCalls} calls`);

    // Build Shotstack timeline
    const timeline = buildTimeline(platform, industry, content, template, liveStats);

    // Submit render
    const renderId = await submitRender(timeline);
    console.log(`[VideoGen] Render submitted: ${renderId}`);

    // Wait for completion (max 5 minutes)
    const result = await waitForRender(renderId, 300000);

    if (!result.url) {
      return { success: false, error: result.error || "Render completed without URL", renderId };
    }

    // Upload to S3 if configured, otherwise use Shotstack CDN URL directly
    let finalVideoUrl = result.url;
    let finalThumbnailUrl = result.thumbnail;

    if (isS3Configured()) {
      try {
        const timestamp = Date.now();
        const videoKey = `social-media/videos/${platform}/${timestamp}-${template}.mp4`;
        finalVideoUrl = await uploadUrlToS3(result.url, videoKey, "video/mp4");

        if (result.thumbnail) {
          const thumbKey = `social-media/thumbnails/${platform}/${timestamp}-${template}.jpg`;
          finalThumbnailUrl = await uploadUrlToS3(result.thumbnail, thumbKey, "image/jpeg");
        }

        console.log(`[VideoGen] Uploaded to S3: ${finalVideoUrl}`);
      } catch (s3Error) {
        console.error("[VideoGen] S3 upload failed, using Shotstack CDN URL:", s3Error);
        // Fall through — use Shotstack CDN URL
      }
    }

    console.log(`[VideoGen] Video ready: ${finalVideoUrl}`);

    return {
      success: true,
      videoUrl: finalVideoUrl,
      thumbnailUrl: finalThumbnailUrl,
      renderId,
      duration: getDurationForTemplate(template),
      template,
    };
  } catch (error: any) {
    console.error("[VideoGen] Error generating video:", error);
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * Check the status of a Shotstack render.
 */
export async function checkRenderStatus(renderId: string): Promise<RenderStatus> {
  const response = await fetch(`${SHOTSTACK_BASE}/render/${renderId}`, {
    headers: { "x-api-key": SHOTSTACK_API_KEY },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shotstack status check failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as any;
  const r = data.response;

  return {
    id: r.id,
    status: r.status,
    url: r.url || undefined,
    thumbnail: r.thumbnail || undefined,
    error: r.error || undefined,
  };
}

// ── Render Submission ────────────────────────────────────────────────────

async function submitRender(timeline: any): Promise<string> {
  const response = await fetch(`${SHOTSTACK_BASE}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": SHOTSTACK_API_KEY,
    },
    body: JSON.stringify(timeline),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shotstack render submission failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as any;
  return data.response.id;
}

async function waitForRender(renderId: string, timeoutMs: number = 300000): Promise<RenderStatus> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < timeoutMs) {
    const status = await checkRenderStatus(renderId);

    if (status.status === "done") {
      return status;
    }

    if (status.status === "failed") {
      return { ...status, error: status.error || "Render failed" };
    }

    console.log(`[VideoGen] Render ${renderId} status: ${status.status}...`);
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return {
    id: renderId,
    status: "failed",
    error: `Render timed out after ${timeoutMs / 1000}s`,
  };
}

// ── Template Builders ────────────────────────────────────────────────────

function getDurationForTemplate(template: TemplateType): number {
  switch (template) {
    case "feature_highlight": return 25;
    case "customer_stats": return 20;
    case "before_after": return 25;
    case "testimonial_quote": return 20;
    case "platform_demo": return 30;
    default: return 25;
  }
}

function getPlatformDimensions(platform: SocialPlatform): { width: number; height: number } {
  switch (platform) {
    case "instagram": return { width: 1080, height: 1920 }; // 9:16 Reels
    case "twitter":
    case "facebook":
    case "linkedin":
    default: return { width: 1920, height: 1080 }; // 16:9
  }
}

/**
 * Build a complete Shotstack Edit API payload for the given template.
 */
function buildTimeline(
  platform: SocialPlatform,
  industry: string,
  content: string,
  template: TemplateType,
  stats: LiveStats
): any {
  const { width, height } = getPlatformDimensions(platform);
  const isVertical = height > width;

  // Get template-specific tracks
  let tracks: any[];
  let duration: number;

  switch (template) {
    case "feature_highlight":
      ({ tracks, duration } = buildFeatureHighlight(industry, content, isVertical, stats));
      break;
    case "customer_stats":
      ({ tracks, duration } = buildCustomerStats(industry, isVertical, stats));
      break;
    case "before_after":
      ({ tracks, duration } = buildBeforeAfter(industry, isVertical));
      break;
    case "testimonial_quote":
      ({ tracks, duration } = buildTestimonialQuote(content, industry, isVertical));
      break;
    case "platform_demo":
      ({ tracks, duration } = buildPlatformDemo(industry, isVertical, stats));
      break;
    default:
      ({ tracks, duration } = buildFeatureHighlight(industry, content, isVertical, stats));
  }

  return {
    timeline: {
      background: "#000000",
      tracks,
    },
    output: {
      format: "mp4",
      resolution: isVertical ? "1080" : "hd",
      aspectRatio: isVertical ? "9:16" : "16:9",
      size: {
        width,
        height,
      },
      fps: 25,
    },
  };
}

// ── Template 1: Feature Highlight ────────────────────────────────────────

function buildFeatureHighlight(industry: string, content: string, isVertical: boolean, stats: LiveStats) {
  const duration = 25;
  const fontSize = isVertical ? 48 : 60;
  const bodyFontSize = isVertical ? 32 : 40;

  // Extract first sentence of content for the headline
  const headline = content.split(/[.!?]/)[0].trim().substring(0, 60);

  // Use real stats in the subtitle when available
  const subtitle = stats.totalBusinesses > 0
    ? `Trusted by ${formatStat(stats.totalBusinesses, "")} ${industry} businesses`
    : `Perfect for ${industry} businesses`;

  const features = [
    "AI Receptionist answers every call",
    "Automatic appointment booking",
    "Smart follow-up messages",
  ];

  const tracks = [
    // CTA end card (bottom layer, appears last)
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:60px;color:white"><p style="font-size:${bodyFontSize}px;font-weight:bold">Try SmallBizAgent Free</p><p style="font-size:${bodyFontSize - 8}px;opacity:0.8">${BRAND_URL}</p></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 1920 : 1080,
          },
          start: 20,
          length: 5,
          transition: { in: "fade" },
        },
      ],
    },
    // Feature bullets (appear one at a time)
    ...features.map((feature, i) => ({
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;padding:${isVertical ? '40px' : '30px'} 60px;color:white"><p style="font-size:${bodyFontSize}px">✅ ${feature}</p></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 400 : 200,
          },
          start: 7 + i * 4,
          length: 13 - i * 4,
          position: isVertical ? "center" : "center",
          offset: { y: isVertical ? -0.1 + i * 0.15 : -0.05 + i * 0.12 },
          transition: { in: "slideRight" },
        },
      ],
    })),
    // Headline (appears first)
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:60px;color:white"><h1 style="font-size:${fontSize}px;font-weight:bold;line-height:1.3">${headline || 'Never Miss Another Call'}</h1><p style="font-size:${bodyFontSize - 4}px;opacity:0.8;margin-top:20px">${subtitle}</p></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 600 : 400,
          },
          start: 0,
          length: 20,
          position: "top",
          offset: { y: isVertical ? 0.15 : 0.1 },
          transition: { in: "slideLeft" },
        },
      ],
    },
    // Background gradient
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="width:100%;height:100%;background:linear-gradient(135deg, #1e3a5f 0%, #7c3aed 50%, #2563eb 100%)"></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 1920 : 1080,
          },
          start: 0,
          length: duration,
        },
      ],
    },
  ];

  return { tracks, duration };
}

// ── Template 2: Customer Stats ───────────────────────────────────────────

function buildCustomerStats(industry: string, isVertical: boolean, liveStats: LiveStats) {
  const duration = 20;
  const titleFontSize = isVertical ? 44 : 56;
  const statFontSize = isVertical ? 52 : 64;
  const labelFontSize = isVertical ? 24 : 28;

  // Use real platform stats when available, with honest fallbacks
  const stats = [
    {
      value: liveStats.totalBusinesses > 0 ? formatStat(liveStats.totalBusinesses) : "24/7",
      label: liveStats.totalBusinesses > 0 ? "Businesses on the Platform" : "Always Available",
    },
    {
      value: liveStats.totalCalls > 0 ? formatStat(liveStats.totalCalls) : "0",
      label: liveStats.totalCalls > 0 ? "Calls Handled by AI" : "Missed Calls with AI",
    },
    {
      value: liveStats.callsThisMonth > 0 ? formatStat(liveStats.callsThisMonth) : "Auto",
      label: liveStats.callsThisMonth > 0 ? "Calls This Month" : "Appointment Booking",
    },
  ];

  const tracks = [
    // CTA
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:40px;color:white"><p style="font-size:${labelFontSize + 8}px;font-weight:bold">Join ${industry} leaders on SmallBizAgent</p></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 300 : 200,
          },
          start: 16,
          length: 4,
          position: "bottom",
          offset: { y: -0.1 },
          transition: { in: "fade" },
        },
      ],
    },
    // Stats (staggered)
    ...stats.map((stat, i) => ({
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;color:white;padding:30px"><p style="font-size:${statFontSize}px;font-weight:bold;color:#60a5fa">${stat.value}</p><p style="font-size:${labelFontSize}px;opacity:0.9">${stat.label}</p></div>`,
            width: isVertical ? 1080 : 600,
            height: isVertical ? 300 : 200,
          },
          start: 4 + i * 4,
          length: 16 - i * 4,
          position: isVertical ? "center" : "center",
          offset: isVertical
            ? { y: -0.15 + i * 0.15 }
            : { x: -0.3 + i * 0.3 },
          transition: { in: "slideUp" },
        },
      ],
    })),
    // Title
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:40px;color:white"><h1 style="font-size:${titleFontSize}px;font-weight:bold">SmallBizAgent by the Numbers</h1></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 400 : 300,
          },
          start: 0,
          length: 16,
          position: "top",
          offset: { y: isVertical ? 0.1 : 0.05 },
          transition: { in: "fade" },
        },
      ],
    },
    // Background
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="width:100%;height:100%;background:linear-gradient(180deg, #0f172a 0%, #1e293b 100%)"></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 1920 : 1080,
          },
          start: 0,
          length: duration,
        },
      ],
    },
  ];

  return { tracks, duration };
}

// ── Template 3: Before & After ───────────────────────────────────────────

function buildBeforeAfter(industry: string, isVertical: boolean) {
  const duration = 25;
  const headerFont = isVertical ? 40 : 48;
  const bodyFont = isVertical ? 28 : 34;

  const beforeItems = ["Missed calls", "Lost revenue", "Manual scheduling", "No follow-ups"];
  const afterItems = ["AI answers 24/7", "Every lead captured", "Auto booking", "Smart reminders"];

  const tracks = [
    // CTA end card
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:60px;color:white;background:linear-gradient(135deg,#059669,#2563eb)"><p style="font-size:${headerFont}px;font-weight:bold">Upgrade Your ${industry} Business</p><p style="font-size:${bodyFont - 4}px;margin-top:20px;opacity:0.9">${BRAND_URL}</p></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 1920 : 1080,
          },
          start: 21,
          length: 4,
          transition: { in: "fade" },
        },
      ],
    },
    // After column
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;padding:40px;color:white"><h2 style="font-size:${headerFont}px;color:#34d399;margin-bottom:20px">✅ After</h2>${afterItems.map(item => `<p style="font-size:${bodyFont}px;margin:12px 0;color:#bbf7d0">• ${item}</p>`).join('')}</div>`,
            width: isVertical ? 1080 : 900,
            height: isVertical ? 800 : 600,
          },
          start: 10,
          length: 11,
          position: isVertical ? "center" : "right",
          offset: isVertical ? { y: 0.1 } : { x: -0.05 },
          transition: { in: "slideRight" },
        },
      ],
    },
    // Before column
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;padding:40px;color:white"><h2 style="font-size:${headerFont}px;color:#f87171;margin-bottom:20px">❌ Before</h2>${beforeItems.map(item => `<p style="font-size:${bodyFont}px;margin:12px 0;color:#fca5a5">• ${item}</p>`).join('')}</div>`,
            width: isVertical ? 1080 : 900,
            height: isVertical ? 800 : 600,
          },
          start: 2,
          length: 19,
          position: isVertical ? "center" : "left",
          offset: isVertical ? { y: -0.15 } : { x: 0.05 },
          transition: { in: "slideLeft" },
        },
      ],
    },
    // Title
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:30px;color:white"><h1 style="font-size:${headerFont + 4}px;font-weight:bold">${industry}: Before vs After SmallBizAgent</h1></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 400 : 200,
          },
          start: 0,
          length: 21,
          position: "top",
          offset: { y: isVertical ? 0.08 : 0.03 },
          transition: { in: "fade" },
        },
      ],
    },
    // Background
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="width:100%;height:100%;background:linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)"></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 1920 : 1080,
          },
          start: 0,
          length: duration,
        },
      ],
    },
  ];

  return { tracks, duration };
}

// ── Template 4: Testimonial Quote ────────────────────────────────────────

function buildTestimonialQuote(content: string, industry: string, isVertical: boolean) {
  const duration = 20;
  const quoteFont = isVertical ? 36 : 44;
  const creditFont = isVertical ? 24 : 28;

  // Use the AI-generated content as the "quote"
  const quote = content.length > 180 ? content.substring(0, 177) + "..." : content;

  const tracks = [
    // CTA
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:40px;color:white"><p style="font-size:${creditFont + 4}px;font-weight:bold">See why ${industry} businesses choose us</p><p style="font-size:${creditFont}px;opacity:0.8;margin-top:10px">${BRAND_URL}</p></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 400 : 250,
          },
          start: 16,
          length: 4,
          position: "bottom",
          offset: { y: -0.05 },
          transition: { in: "fade" },
        },
      ],
    },
    // Star rating
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:20px"><p style="font-size:${quoteFont}px;color:#fbbf24">⭐⭐⭐⭐⭐</p></div>`,
            width: isVertical ? 1080 : 800,
            height: 150,
          },
          start: 2,
          length: 14,
          position: "center",
          offset: { y: isVertical ? -0.25 : -0.2 },
          transition: { in: "slideUp" },
        },
      ],
    },
    // Quote text
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Georgia,serif;text-align:center;padding:${isVertical ? '40px' : '40px 100px'};color:white"><p style="font-size:${quoteFont}px;font-style:italic;line-height:1.5">"${quote}"</p></div>`,
            width: isVertical ? 1080 : 1600,
            height: isVertical ? 800 : 500,
          },
          start: 3,
          length: 13,
          position: "center",
          offset: { y: 0.02 },
          transition: { in: "fade" },
        },
      ],
    },
    // Attribution
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:20px;color:white"><p style="font-size:${creditFont}px;opacity:0.7">— Happy ${industry} Business Owner</p></div>`,
            width: isVertical ? 1080 : 1000,
            height: 150,
          },
          start: 5,
          length: 11,
          position: "center",
          offset: { y: isVertical ? 0.2 : 0.18 },
          transition: { in: "fade" },
        },
      ],
    },
    // Background
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="width:100%;height:100%;background:linear-gradient(180deg, #0c0a09 0%, #292524 50%, #1c1917 100%)"></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 1920 : 1080,
          },
          start: 0,
          length: duration,
        },
      ],
    },
  ];

  return { tracks, duration };
}

// ── Template 5: Platform Demo ────────────────────────────────────────────

function buildPlatformDemo(industry: string, isVertical: boolean, stats: LiveStats) {
  const duration = 30;
  const headerFont = isVertical ? 40 : 48;
  const stepFont = isVertical ? 32 : 38;
  const captionFont = isVertical ? 24 : 28;

  // Use real call count in step caption when available
  const callCaption = stats.totalCalls > 0
    ? `Already handled ${formatStat(stats.totalCalls)} calls`
    : "Your AI receptionist answers instantly";

  const steps = [
    { icon: "📞", title: "Customer Calls", caption: callCaption },
    { icon: "🤖", title: "AI Converses", caption: "Natural conversation, books appointments" },
    { icon: "📅", title: "Appointment Booked", caption: "Synced to your calendar in real-time" },
    { icon: "💬", title: "Follow-Up Sent", caption: "Automatic SMS confirmation + reminders" },
  ];

  const tracks = [
    // CTA end card
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:60px;color:white;background:linear-gradient(135deg,#2563eb,#7c3aed)"><p style="font-size:${headerFont}px;font-weight:bold">Ready to automate your ${industry} business?</p><p style="font-size:${captionFont + 4}px;margin-top:20px;opacity:0.9">Start your free trial → ${BRAND_URL}</p></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 1920 : 1080,
          },
          start: 25,
          length: 5,
          transition: { in: "fade" },
        },
      ],
    },
    // Steps (appear one at a time with stagger)
    ...steps.map((step, i) => ({
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:${isVertical ? '40px' : '30px'};color:white"><p style="font-size:${stepFont + 16}px;margin-bottom:10px">${step.icon}</p><p style="font-size:${stepFont}px;font-weight:bold">${step.title}</p><p style="font-size:${captionFont}px;opacity:0.8;margin-top:8px">${step.caption}</p></div>`,
            width: isVertical ? 1080 : 1200,
            height: isVertical ? 600 : 400,
          },
          start: 4 + i * 5,
          length: 5,
          position: "center",
          transition: { in: "slideUp", out: "slideLeft" },
        },
      ],
    })),
    // Step counter
    ...steps.map((_, i) => ({
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:10px;color:white"><p style="font-size:${captionFont - 4}px;opacity:0.6">Step ${i + 1} of ${steps.length}</p></div>`,
            width: isVertical ? 1080 : 400,
            height: 80,
          },
          start: 4 + i * 5,
          length: 5,
          position: "bottom",
          offset: { y: isVertical ? -0.15 : -0.1 },
        },
      ],
    })),
    // Title
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:40px;color:white"><h1 style="font-size:${headerFont}px;font-weight:bold">How SmallBizAgent Works</h1><p style="font-size:${captionFont}px;opacity:0.7;margin-top:10px">${stats.totalBusinesses > 0 ? `Join ${formatStat(stats.totalBusinesses)} businesses` : `For ${industry} businesses`}</p></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 400 : 250,
          },
          start: 0,
          length: 4,
          position: "center",
          transition: { in: "fade", out: "fade" },
        },
      ],
    },
    // Background
    {
      clips: [
        {
          asset: {
            type: "html",
            html: `<div style="width:100%;height:100%;background:linear-gradient(160deg, #0f172a 0%, #1e3a5f 40%, #172554 100%)"></div>`,
            width: isVertical ? 1080 : 1920,
            height: isVertical ? 1920 : 1080,
          },
          start: 0,
          length: duration,
        },
      ],
    },
  ];

  return { tracks, duration };
}
