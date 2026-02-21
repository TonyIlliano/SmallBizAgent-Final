/**
 * Website Scraper Service
 *
 * Scrapes a business's website to extract knowledge (policies, FAQs, service areas, etc.)
 * and stores it as structured knowledge entries for the AI receptionist.
 *
 * Flow:
 * 1. Fetch homepage HTML
 * 2. Discover internal links (max 5 additional pages)
 * 3. Strip HTML, extract text from all pages
 * 4. Send to OpenAI to summarize into structured categories
 * 5. Store as business_knowledge entries (auto-approved, source: 'website')
 * 6. Trigger Vapi assistant update to inject new knowledge into prompt
 */

import OpenAI from 'openai';
import { storage } from '../storage';
import { debouncedUpdateVapiAssistant } from './vapiProvisioningService';

// Max pages to crawl (homepage + internal links)
const MAX_PAGES = 6;
// Max characters of raw text per page
const MAX_CHARS_PER_PAGE = 50000;
// Max total characters of combined raw text
const MAX_TOTAL_CHARS = 100000;
// Delay between page fetches (ms)
const FETCH_DELAY = 1000;
// Fetch timeout (ms)
const FETCH_TIMEOUT = 10000;

/**
 * Strip HTML tags, scripts, styles, and normalize whitespace
 */
function stripHtml(html: string): string {
  let text = html;

  // Remove script and style blocks entirely
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Replace common block elements with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<hr\s*\/?>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&#x2F;/g, '/');
  text = text.replace(/&mdash;/g, '—');
  text = text.replace(/&ndash;/g, '–');
  text = text.replace(/&copy;/g, '©');
  text = text.replace(/&reg;/g, '®');
  text = text.replace(/&trade;/g, '™');

  // Collapse multiple spaces/newlines
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Discover internal links from an HTML page (same domain only)
 */
function discoverInternalLinks(html: string, baseUrl: string): string[] {
  const links: Set<string> = new Set();

  try {
    const baseUrlObj = new URL(baseUrl);
    const baseDomain = baseUrlObj.hostname;

    // Find all href attributes
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let match;

    while ((match = hrefRegex.exec(html)) !== null) {
      try {
        let href = match[1];

        // Skip anchors, javascript, mailto, tel links
        if (href.startsWith('#') || href.startsWith('javascript:') ||
            href.startsWith('mailto:') || href.startsWith('tel:')) {
          continue;
        }

        // Resolve relative URLs
        const resolvedUrl = new URL(href, baseUrl);

        // Only same domain
        if (resolvedUrl.hostname !== baseDomain) continue;

        // Only http/https
        if (!resolvedUrl.protocol.startsWith('http')) continue;

        // Skip common non-content paths
        const path = resolvedUrl.pathname.toLowerCase();
        if (path.match(/\.(jpg|jpeg|png|gif|svg|pdf|css|js|ico|woff|woff2|ttf|eot|mp4|mp3|zip|xml|json)$/)) {
          continue;
        }

        // Normalize: remove trailing slash, remove hash
        resolvedUrl.hash = '';
        const normalizedUrl = resolvedUrl.toString().replace(/\/$/, '');

        // Skip the base URL itself
        const normalizedBase = baseUrl.replace(/\/$/, '');
        if (normalizedUrl === normalizedBase) continue;

        links.add(normalizedUrl);
      } catch {
        // Invalid URL, skip
      }
    }
  } catch {
    // Invalid base URL
  }

  // Return limited set, prioritize common useful pages
  const allLinks = Array.from(links);
  const priorityKeywords = ['about', 'faq', 'service', 'policy', 'contact', 'pricing', 'area', 'coverage', 'hours'];

  // Sort: priority pages first, then others
  allLinks.sort((a, b) => {
    const aPath = a.toLowerCase();
    const bPath = b.toLowerCase();
    const aPriority = priorityKeywords.some(k => aPath.includes(k)) ? 0 : 1;
    const bPriority = priorityKeywords.some(k => bPath.includes(k)) ? 0 : 1;
    return aPriority - bPriority;
  });

  return allLinks.slice(0, MAX_PAGES - 1); // -1 because homepage is already fetched
}

/**
 * Fetch a single page with timeout
 */
async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SmallBizAgent Knowledge Bot/1.0 (Website Knowledge Extraction)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return null;
    }

    const text = await response.text();
    return text.substring(0, MAX_CHARS_PER_PAGE * 2); // Raw HTML can be larger, will be stripped
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`Timeout fetching ${url}`);
    } else {
      console.warn(`Error fetching ${url}:`, error.message);
    }
    return null;
  }
}

/**
 * Use OpenAI to summarize raw website text into structured knowledge categories
 */
async function summarizeWithAI(
  rawText: string,
  businessName: string,
  industry: string
): Promise<Array<{ question: string; answer: string; category: string }>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY not configured — cannot summarize website');
    return [];
  }

  console.log(`[WebsiteScraper] OpenAI API key found (${apiKey.substring(0, 8)}...), calling summarizeWithAI for "${businessName}" (${industry})`);
  console.log(`[WebsiteScraper] Raw text length: ${rawText.length} chars`);

  const openai = new OpenAI({ apiKey });

  try {
    // Truncate raw text to fit in context window
    const truncatedText = rawText.substring(0, 30000);
    console.log(`[WebsiteScraper] Sending ${truncatedText.length} chars to OpenAI gpt-5-mini...`);

    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      temperature: 0.3,
      max_tokens: 3000,
      messages: [
        {
          role: 'system',
          content: `You are analyzing a business website to extract useful knowledge for an AI phone receptionist. The business is "${businessName}" in the "${industry || 'general'}" industry.

Extract information into Q&A pairs organized by category. Only extract FACTUAL information that is explicitly stated on the website. Do NOT make up or infer information.

Categories:
- policies: Return/refund policies, cancellation policies, warranties, guarantees, terms
- service_area: Cities/regions served, delivery range, service boundaries, coverage areas
- faq: Common questions and answers found on the site
- pricing: Pricing information, packages, specials (note: CRM service prices take priority)
- about: Mission statement, years in business, certifications, unique selling points, team info
- general: Any other useful business facts

Return a JSON array of objects. Each object should have:
- "question": A natural question a caller might ask (e.g., "What is your cancellation policy?")
- "answer": A concise, conversational answer the AI receptionist should give (1-3 sentences)
- "category": One of the categories above

Guidelines:
- Keep answers concise and conversational (as if spoken on a phone call)
- Focus on information callers are likely to ask about
- Skip navigation text, footer links, cookie notices, etc.
- If the website has very little useful content, return fewer entries
- Maximum 20 entries total
- Return valid JSON array only, no markdown

If no useful information can be extracted, return: []`
        },
        {
          role: 'user',
          content: `Here is the text extracted from the business website:\n\n${truncatedText}`
        }
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    console.log(`[WebsiteScraper] OpenAI response received. Content length: ${content?.length || 0}`);
    console.log(`[WebsiteScraper] OpenAI raw response (first 500 chars): ${content?.substring(0, 500)}`);

    if (!content) {
      console.error('[WebsiteScraper] OpenAI returned empty content');
      return [];
    }

    // Parse JSON response — handle potential markdown code blocks
    let jsonStr = content;
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error(`[WebsiteScraper] JSON parse failed. Raw content: ${content.substring(0, 1000)}`);
      throw parseErr;
    }

    if (!Array.isArray(parsed)) {
      console.error(`[WebsiteScraper] Parsed result is not an array, got: ${typeof parsed}`);
      return [];
    }

    // Validate each entry
    const validated = parsed.filter((entry: any) =>
      entry && typeof entry.question === 'string' && typeof entry.answer === 'string' &&
      typeof entry.category === 'string' && entry.question.length > 0 && entry.answer.length > 0
    ).slice(0, 20); // Cap at 20 entries

    console.log(`[WebsiteScraper] Parsed ${parsed.length} entries, ${validated.length} valid after filtering`);
    return validated;

  } catch (error) {
    console.error('[WebsiteScraper] Error summarizing website with AI:', error);
    return [];
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main entry point: Scrape a business website and extract knowledge
 */
export async function scrapeWebsite(businessId: number, url: string): Promise<{
  success: boolean;
  entriesCreated: number;
  error?: string;
}> {
  console.log(`Starting website scrape for business ${businessId}: ${url}`);

  // Validate URL
  try {
    new URL(url);
  } catch {
    await storage.upsertWebsiteScrapeCache(businessId, {
      url,
      status: 'failed',
      errorMessage: 'Invalid URL format',
    });
    return { success: false, entriesCreated: 0, error: 'Invalid URL format' };
  }

  // Set status to scraping
  await storage.upsertWebsiteScrapeCache(businessId, {
    url,
    status: 'scraping',
    errorMessage: null,
  });

  try {
    // Step 1: Fetch homepage
    const homepageHtml = await fetchPage(url);
    if (!homepageHtml) {
      throw new Error('Could not fetch homepage');
    }

    const homepageText = stripHtml(homepageHtml);
    let allText = `=== HOMEPAGE ===\n${homepageText.substring(0, MAX_CHARS_PER_PAGE)}\n\n`;
    let pagesScraped = 1;

    // Step 2: Discover and fetch internal pages
    const internalLinks = discoverInternalLinks(homepageHtml, url);
    console.log(`Discovered ${internalLinks.length} internal links for business ${businessId}`);

    for (const link of internalLinks) {
      if (allText.length >= MAX_TOTAL_CHARS) break;

      await sleep(FETCH_DELAY); // Rate limiting

      const pageHtml = await fetchPage(link);
      if (!pageHtml) continue;

      const pageText = stripHtml(pageHtml);
      if (pageText.length < 50) continue; // Skip near-empty pages

      // Extract page path for context
      const pagePath = new URL(link).pathname;
      allText += `=== PAGE: ${pagePath} ===\n${pageText.substring(0, MAX_CHARS_PER_PAGE)}\n\n`;
      pagesScraped++;
    }

    // Enforce total character limit
    allText = allText.substring(0, MAX_TOTAL_CHARS);

    console.log(`[WebsiteScraper] Scraped ${pagesScraped} pages (${allText.length} chars) for business ${businessId}`);
    console.log(`[WebsiteScraper] First 500 chars of scraped text: ${allText.substring(0, 500)}`);

    // Step 3: Get business info for AI context
    const business = await storage.getBusiness(businessId);
    const businessName = business?.name || 'Unknown Business';
    const industry = business?.industry || 'general';
    console.log(`[WebsiteScraper] Business: "${businessName}", Industry: "${industry}"`);

    // Step 4: Summarize with AI
    console.log(`[WebsiteScraper] Starting AI summarization...`);
    const knowledgeEntries = await summarizeWithAI(allText, businessName, industry);

    console.log(`[WebsiteScraper] AI extracted ${knowledgeEntries.length} knowledge entries for business ${businessId}`);

    // Step 5: Clear old website-sourced knowledge and create new entries
    await storage.deleteBusinessKnowledgeBySource(businessId, 'website');

    let entriesCreated = 0;
    for (const entry of knowledgeEntries) {
      await storage.createBusinessKnowledge({
        businessId,
        question: entry.question,
        answer: entry.answer,
        category: entry.category,
        source: 'website',
        isApproved: true, // Auto-approved from business's own website
        priority: 5, // Medium priority
      });
      entriesCreated++;
    }

    // Step 6: Update scrape cache
    await storage.upsertWebsiteScrapeCache(businessId, {
      url,
      pagesScraped,
      rawContent: allText.substring(0, 50000), // Store trimmed raw content for re-processing
      structuredKnowledge: knowledgeEntries,
      status: 'completed',
      errorMessage: null,
      lastScrapedAt: new Date(),
    });

    // Step 7: Trigger Vapi assistant update to inject new knowledge
    try {
      debouncedUpdateVapiAssistant(businessId);
    } catch (e) {
      console.warn('Could not trigger Vapi update after scrape:', e);
    }

    console.log(`Website scrape completed for business ${businessId}: ${entriesCreated} entries created`);
    return { success: true, entriesCreated };

  } catch (error: any) {
    console.error(`Website scrape failed for business ${businessId}:`, error);

    await storage.upsertWebsiteScrapeCache(businessId, {
      url,
      status: 'failed',
      errorMessage: error.message || String(error),
    });

    return { success: false, entriesCreated: 0, error: error.message || String(error) };
  }
}
