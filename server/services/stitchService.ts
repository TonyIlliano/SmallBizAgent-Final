/**
 * Google Stitch Service
 *
 * Integrates with Google's Stitch AI (stitch.withgoogle.com) via the official
 * @google/stitch-sdk to generate one-page websites from text prompts.
 *
 * Requires STITCH_API_KEY environment variable.
 * Free tier: 350 generations/month (Gemini 2.5 Flash).
 */

// ─── Types (declared locally to avoid import issues with ESM SDK) ────────────

interface StitchScreen {
  getHtml(): Promise<string>;
  getImage(): Promise<string>;
}

interface StitchProject {
  generate(prompt: string, deviceType?: string): Promise<StitchScreen>;
}

interface StitchClient {
  callTool<T = any>(name: string, args: Record<string, unknown>): Promise<T>;
  close(): Promise<void>;
}

// ─── Lazy SDK Loading ────────────────────────────────────────────────────────

let _sdkModule: any = null;

async function getStitchSdk(): Promise<any> {
  if (!_sdkModule) {
    _sdkModule = await import('@google/stitch-sdk');
  }
  return _sdkModule;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface StitchGenerationResult {
  htmlUrl: string;
  screenshotUrl: string;
}

/**
 * Generate a website using Google Stitch from a text prompt.
 * Returns download URLs for the HTML and a screenshot.
 *
 * @param prompt - The Stitch prompt (from businessScannerService)
 * @param projectTitle - Title for the Stitch project (business name)
 * @returns Object with htmlUrl and screenshotUrl
 */
export async function generateWithStitch(
  prompt: string,
  projectTitle: string,
): Promise<StitchGenerationResult> {
  const apiKey = process.env.STITCH_API_KEY;
  if (!apiKey) {
    throw new Error('STITCH_API_KEY not configured — cannot generate website');
  }

  console.log(`[StitchService] Generating website for: ${projectTitle}`);

  const sdk = await getStitchSdk();
  const { StitchToolClient } = sdk;

  const client: StitchClient = new StitchToolClient({ apiKey });

  try {
    // 1. Create a project
    const createResult = await client.callTool('create_project', {
      title: projectTitle,
    });

    // Extract project ID from the tool response
    const projectId = extractProjectId(createResult);
    if (!projectId) {
      throw new Error('Failed to create Stitch project — no project ID returned');
    }

    console.log(`[StitchService] Project created: ${projectId}`);

    // 2. Generate a desktop screen from the prompt
    const generateResult = await client.callTool('generate_screen_from_text', {
      project_id: projectId,
      prompt,
      device_type: 'DESKTOP',
    });

    const screenId = extractScreenId(generateResult);
    if (!screenId) {
      throw new Error('Failed to generate screen — no screen ID returned');
    }

    console.log(`[StitchService] Screen generated: ${screenId}`);

    // 3. Get the screen data (HTML + screenshot)
    const screenData = await client.callTool('get_screen', {
      project_id: projectId,
      screen_id: screenId,
    });

    const htmlUrl = extractHtmlUrl(screenData);
    const screenshotUrl = extractImageUrl(screenData);

    if (!htmlUrl) {
      throw new Error('Stitch did not return an HTML download URL');
    }

    console.log(`[StitchService] Generation complete. HTML URL: ${htmlUrl}`);

    return {
      htmlUrl,
      screenshotUrl: screenshotUrl || '',
    };
  } finally {
    await client.close().catch(() => {});
  }
}

/**
 * Download the HTML content from a Stitch-generated URL.
 */
export async function downloadStitchHtml(htmlUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(htmlUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Failed to download HTML: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('HTML download timed out');
    }
    throw error;
  }
}

/**
 * Check if Stitch integration is available (API key configured).
 */
export function isStitchConfigured(): boolean {
  return !!process.env.STITCH_API_KEY;
}

// ─── Response Parsing Helpers ────────────────────────────────────────────────

function extractProjectId(result: any): string | null {
  if (!result) return null;
  // MCP tool responses can be nested in various shapes
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { return null; }
  }
  // Direct field
  if (result.project_id) return result.project_id;
  if (result.projectId) return result.projectId;
  if (result.id) return result.id;
  // Nested in content array (MCP format)
  if (Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item.text) {
        try {
          const parsed = JSON.parse(item.text);
          if (parsed.project_id) return parsed.project_id;
          if (parsed.projectId) return parsed.projectId;
          if (parsed.id) return parsed.id;
        } catch {}
      }
    }
  }
  return null;
}

function extractScreenId(result: any): string | null {
  if (!result) return null;
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { return null; }
  }
  if (result.screen_id) return result.screen_id;
  if (result.screenId) return result.screenId;
  if (result.id) return result.id;
  if (Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item.text) {
        try {
          const parsed = JSON.parse(item.text);
          if (parsed.screen_id) return parsed.screen_id;
          if (parsed.screenId) return parsed.screenId;
          if (parsed.id) return parsed.id;
        } catch {}
      }
    }
  }
  return null;
}

function extractHtmlUrl(result: any): string | null {
  if (!result) return null;
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { return null; }
  }
  if (result.html_url) return result.html_url;
  if (result.htmlUrl) return result.htmlUrl;
  if (result.html) return result.html;
  if (Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item.text) {
        try {
          const parsed = JSON.parse(item.text);
          if (parsed.html_url) return parsed.html_url;
          if (parsed.htmlUrl) return parsed.htmlUrl;
          if (parsed.html) return parsed.html;
        } catch {}
      }
    }
  }
  return null;
}

function extractImageUrl(result: any): string | null {
  if (!result) return null;
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { return null; }
  }
  if (result.image_url) return result.image_url;
  if (result.imageUrl) return result.imageUrl;
  if (result.screenshot_url) return result.screenshot_url;
  if (result.image) return result.image;
  if (Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item.text) {
        try {
          const parsed = JSON.parse(item.text);
          if (parsed.image_url) return parsed.image_url;
          if (parsed.imageUrl) return parsed.imageUrl;
          if (parsed.screenshot_url) return parsed.screenshot_url;
          if (parsed.image) return parsed.image;
        } catch {}
      }
    }
  }
  return null;
}
