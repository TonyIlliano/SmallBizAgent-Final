/**
 * Pexels API Service
 *
 * Searches and fetches stock video clips from Pexels.com for use in
 * automated marketing video assembly. Completely free API with generous
 * rate limits (200 req/hr, 20K req/month).
 *
 * Videos are returned with direct download URLs that can be piped
 * directly into Shotstack's timeline `src` field.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || "";
const PEXELS_BASE = "https://api.pexels.com";

export interface PexelsVideo {
  id: number;
  url: string; // Pexels page URL
  width: number;
  height: number;
  duration: number; // seconds
  image: string; // thumbnail/poster image
  videoFiles: PexelsVideoFile[];
}

export interface PexelsVideoFile {
  id: number;
  quality: "hd" | "sd" | "uhd";
  fileType: string;
  width: number;
  height: number;
  fps: number;
  link: string; // Direct download URL
}

interface PexelsSearchResult {
  page: number;
  perPage: number;
  totalResults: number;
  videos: PexelsVideo[];
}

/**
 * Check if Pexels API is configured.
 */
export function isPexelsConfigured(): boolean {
  return !!PEXELS_API_KEY;
}

/**
 * Search for stock videos by keyword.
 * Returns videos with direct download URLs sorted by relevance.
 *
 * @param query - Search terms (e.g., "barbershop haircut", "phone ringing office")
 * @param options - Search options
 * @returns Array of matching videos with download URLs
 */
export async function searchVideos(
  query: string,
  options: {
    perPage?: number;
    page?: number;
    orientation?: "landscape" | "portrait" | "square";
    minDuration?: number;
    maxDuration?: number;
  } = {}
): Promise<PexelsSearchResult> {
  if (!PEXELS_API_KEY) {
    console.warn("[Pexels] PEXELS_API_KEY not configured — returning empty results");
    return { page: 1, perPage: 0, totalResults: 0, videos: [] };
  }

  const { perPage = 5, page = 1, orientation, minDuration, maxDuration } = options;

  const params = new URLSearchParams({
    query,
    per_page: String(perPage),
    page: String(page),
  });

  if (orientation) params.set("orientation", orientation);
  if (minDuration) params.set("min_duration", String(minDuration));
  if (maxDuration) params.set("max_duration", String(maxDuration));

  try {
    const response = await fetch(`${PEXELS_BASE}/videos/search?${params}`, {
      headers: { Authorization: PEXELS_API_KEY },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[Pexels] Search failed (${response.status}): ${text}`);
      return { page, perPage, totalResults: 0, videos: [] };
    }

    const data = await response.json() as any;

    const videos: PexelsVideo[] = (data.videos || []).map((v: any) => ({
      id: v.id,
      url: v.url,
      width: v.width,
      height: v.height,
      duration: v.duration,
      image: v.image,
      videoFiles: (v.video_files || []).map((f: any) => ({
        id: f.id,
        quality: f.quality,
        fileType: f.file_type,
        width: f.width,
        height: f.height,
        fps: f.fps,
        link: f.link,
      })),
    }));

    return {
      page: data.page || page,
      perPage: data.per_page || perPage,
      totalResults: data.total_results || 0,
      videos,
    };
  } catch (error: any) {
    console.error("[Pexels] Search error:", error.message);
    return { page, perPage, totalResults: 0, videos: [] };
  }
}

/**
 * Search for multiple terms and return the best matching video for each.
 * Used by the video assembly pipeline to source b-roll from a brief's stock_search_terms.
 *
 * @param searchTerms - Array of search terms from the video brief
 * @param orientation - Video orientation preference
 * @returns Map of search term → best matching video download URL
 */
export async function findBRollForTerms(
  searchTerms: string[],
  orientation: "landscape" | "portrait" = "landscape"
): Promise<Map<string, { url: string; duration: number; thumbnailUrl: string }>> {
  const results = new Map<string, { url: string; duration: number; thumbnailUrl: string }>();

  if (!PEXELS_API_KEY || searchTerms.length === 0) {
    return results;
  }

  // Search for each term in parallel (respecting rate limits with batching)
  const searches = searchTerms.slice(0, 8).map(async (term) => {
    try {
      const searchResult = await searchVideos(term, {
        perPage: 3,
        orientation,
        minDuration: 3,
        maxDuration: 30,
      });

      if (searchResult.videos.length > 0) {
        const video = searchResult.videos[0];
        // Pick the best HD file
        const hdFile = video.videoFiles
          .filter((f) => f.quality === "hd" && f.width >= 720)
          .sort((a, b) => b.width - a.width)[0];

        const bestFile = hdFile || video.videoFiles[0];

        if (bestFile) {
          results.set(term, {
            url: bestFile.link,
            duration: video.duration,
            thumbnailUrl: video.image,
          });
        }
      }
    } catch (err) {
      console.error(`[Pexels] Failed to search for "${term}":`, err);
    }
  });

  await Promise.all(searches);

  console.log(`[Pexels] Found b-roll for ${results.size}/${searchTerms.length} terms`);
  return results;
}
