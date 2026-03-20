/**
 * Business Scanner Service
 *
 * Scrapes a Google Business Profile URL or searches by business name + city
 * to extract publicly available data, then generates a ready-to-use Stitch
 * prompt for building a one-page website.
 *
 * Reuses the existing websiteScraperService infrastructure (fetchPage, stripHtml).
 */

import OpenAI from 'openai';

// ─── Constants ───────────────────────────────────────────────────────────────

const FETCH_TIMEOUT = 15000;

// ─── Vertical Design Presets ─────────────────────────────────────────────────

const VERTICAL_PRESETS: Record<string, string> = {
  barbershop: 'dark background, gold accents, Playfair Display serif, luxury/editorial feel',
  barber: 'dark background, gold accents, Playfair Display serif, luxury/editorial feel',
  salon: 'soft cream and blush tones, elegant minimal, script accent font',
  hvac: 'clean industrial white, navy and orange, bold utilitarian',
  plumbing: 'white and blue, large phone number dominant, high contrast',
  landscaping: 'deep greens, earthy tones, organic layout',
  restaurant: 'rich dark background, warm amber, menu-forward typography',
  dental: 'clean white, calming blues, professional medical',
  medical: 'clean white, calming blues, professional medical',
  automotive: 'dark charcoal, bold red accents, industrial sans-serif',
  electrical: 'navy and yellow, technical precision, bold headings',
  cleaning: 'fresh white and green, airy spacing, modern sans-serif',
  construction: 'concrete gray, safety orange, rugged bold type',
  fitness: 'energetic dark, neon accents, impact typeface',
  veterinary: 'warm earth tones, friendly rounded type, green accents',
  default: 'clean modern, dark background, white text, accent color pulled from business category',
};

function getDesignPreset(businessType: string): string {
  const key = businessType.toLowerCase().trim();
  for (const [preset, value] of Object.entries(VERTICAL_PRESETS)) {
    if (key.includes(preset)) return value;
  }
  return VERTICAL_PRESETS.default;
}

// ─── HTML Stripping (reuses pattern from websiteScraperService) ──────────────

function stripHtml(html: string): string {
  let text = html;
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<hr\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

// ─── Fetch helper ────────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SmallBizAgent/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) return null;
    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return null;

    const text = await response.text();
    return text.substring(0, 200000);
  } catch {
    return null;
  }
}

// ─── AI Extraction ───────────────────────────────────────────────────────────

export interface BusinessScanData {
  businessName: string;
  address: string;
  city: string;
  phone: string;
  hours: string[];
  services: Array<{ name: string; price?: string }>;
  starRating: number | null;
  reviewCount: number | null;
  businessType: string;
  tagline: string;
  photoUrls: string[];
}

async function extractBusinessDataWithAI(rawText: string, hint?: { name?: string; city?: string; url?: string }): Promise<BusinessScanData> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const openai = new OpenAI({ apiKey });
  const truncated = rawText.substring(0, 30000);

  const hintLine = hint?.name
    ? `The business is likely "${hint.name}" in "${hint.city || 'unknown city'}".`
    : hint?.url
      ? `The source URL is: ${hint.url}`
      : '';

  const systemPrompt = `You are analyzing a business listing or website to extract structured data for building a one-page website. ${hintLine}

Return a JSON object with these fields:
- businessName (string)
- address (string, full street address)
- city (string)
- phone (string, formatted)
- hours (string[], e.g. ["Monday: 9 AM - 7 PM", "Tuesday: 9 AM - 7 PM", ...])
- services (array of {name: string, price?: string}, list 4-6 main services with prices if available)
- starRating (number or null, 1-5)
- reviewCount (number or null)
- businessType (string, e.g. "Barbershop", "Salon", "HVAC", "Plumbing", "Restaurant")
- tagline (string, one compelling sentence describing the business)
- photoUrls (string[], URLs of business photos found on the page, max 5)

If a field cannot be determined, use reasonable defaults or null. Return valid JSON only, no markdown.`;

  const modelsToTry = ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const isGpt5 = model.startsWith('gpt-5');
      const response = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        ...(isGpt5 ? { max_completion_tokens: 2000 } : { max_tokens: 2000 }),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract business data from this page content:\n\n${truncated}` },
        ],
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) { lastError = new Error(`${model} returned empty`); continue; }

      let jsonStr = content;
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonStr);
      return {
        businessName: parsed.businessName || 'Unknown Business',
        address: parsed.address || '',
        city: parsed.city || '',
        phone: parsed.phone || '',
        hours: Array.isArray(parsed.hours) ? parsed.hours : [],
        services: Array.isArray(parsed.services) ? parsed.services.slice(0, 6) : [],
        starRating: typeof parsed.starRating === 'number' ? parsed.starRating : null,
        reviewCount: typeof parsed.reviewCount === 'number' ? parsed.reviewCount : null,
        businessType: parsed.businessType || 'General',
        tagline: parsed.tagline || '',
        photoUrls: Array.isArray(parsed.photoUrls) ? parsed.photoUrls.slice(0, 5) : [],
      };
    } catch (error: any) {
      lastError = error;
      continue;
    }
  }

  throw new Error(`AI extraction failed: ${lastError?.message || 'Unknown error'}`);
}

// ─── Stitch Prompt Generator ─────────────────────────────────────────────────

function generateStitchPrompt(data: BusinessScanData): string {
  const preset = getDesignPreset(data.businessType);

  const servicesBlock = data.services.length > 0
    ? data.services.map(s => `- ${s.name}${s.price ? `: ${s.price}` : ''}`).join('\n')
    : '- [Services not listed — fill in manually]';

  const hoursBlock = data.hours.length > 0
    ? data.hours.join('\n')
    : '[Hours not available — fill in manually]';

  const statsItems: string[] = [];
  if (data.starRating) statsItems.push(`${data.starRating}-star rating`);
  if (data.reviewCount) statsItems.push(`${data.reviewCount}+ reviews`);
  statsItems.push('24/7 AI Receptionist');

  const neighborhood = data.city || '[CITY]';

  return `Design a premium one-page website for a ${data.businessType} called ${data.businessName} located in ${neighborhood}.

Business details:
- Phone: ${data.phone || '[PHONE NUMBER]'}
- Address: ${data.address || '[ADDRESS]'}
- Tagline: ${data.tagline || '[ONE LINE DESCRIPTION]'}

Services and pricing:
${servicesBlock}

Hours:
${hoursBlock}

Design direction:
- Aesthetic: ${preset}
- Primary CTA: "Call or Text to Book — ${data.phone || '[PHONE]'}"
- Must prominently feature: "AI Receptionist answers 24/7"
- Footer attribution: "Powered by SmallBizAgent"

Key sections: Hero with CTA, Stats bar (${statsItems.join(' / ')}), Services grid, Booking CTA strip, Hours + Location, Footer.

Export as single HTML file with embedded CSS.`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ScanResult {
  stitchPrompt: string;
  businessData: BusinessScanData;
}

/**
 * Scan a business URL (Google Business Profile, website, etc.)
 * and generate a Stitch prompt.
 */
export async function scanBusinessUrl(url: string): Promise<ScanResult> {
  console.log(`[BusinessScanner] Scanning URL: ${url}`);

  const html = await fetchPage(url);
  if (!html) throw new Error('Could not fetch the provided URL');

  const rawText = stripHtml(html);
  if (rawText.length < 50) throw new Error('Page returned too little content to extract business data');

  const businessData = await extractBusinessDataWithAI(rawText, { url });
  const stitchPrompt = generateStitchPrompt(businessData);

  return { stitchPrompt, businessData };
}

/**
 * Search by business name + city (constructs a Google search URL
 * and scrapes the result page for business data).
 */
export async function scanBusinessByName(businessName: string, city: string): Promise<ScanResult> {
  console.log(`[BusinessScanner] Searching: "${businessName}" in "${city}"`);

  // Try Google Maps search URL directly
  const query = encodeURIComponent(`${businessName} ${city}`);
  const searchUrl = `https://www.google.com/maps/search/${query}`;

  const html = await fetchPage(searchUrl);

  // Google Maps may block scraping — fall back to generating from name/city only
  if (!html || stripHtml(html).length < 100) {
    console.log('[BusinessScanner] Could not scrape search results, generating prompt from name/city only');
    const fallbackData: BusinessScanData = {
      businessName,
      address: '',
      city,
      phone: '',
      hours: [],
      services: [],
      starRating: null,
      reviewCount: null,
      businessType: 'General',
      tagline: `Your trusted local business in ${city}`,
      photoUrls: [],
    };
    return { stitchPrompt: generateStitchPrompt(fallbackData), businessData: fallbackData };
  }

  const rawText = stripHtml(html);
  const businessData = await extractBusinessDataWithAI(rawText, { name: businessName, city });
  const stitchPrompt = generateStitchPrompt(businessData);

  return { stitchPrompt, businessData };
}
