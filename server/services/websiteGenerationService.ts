/**
 * Website Generation Service
 *
 * Generates complete, production-ready one-page websites using OpenAI (gpt-5.4-mini).
 * Pulls all business data from the DB — hours, services, staff, branding,
 * booking settings — and generates a self-contained HTML file with embedded CSS.
 *
 * Uses existing OPENAI_API_KEY from env. No new keys required.
 */

import OpenAI from 'openai';
import { storage } from '../storage';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WebsiteCustomizations {
  // Style
  accent_color?: string;       // hex, overrides vertical preset
  font_style?: 'classic' | 'modern' | 'bold';
  // Hero section
  hero_headline?: string;      // override auto-generated headline
  hero_subheadline?: string;   // override auto-generated subheadline
  hero_image_url?: string;     // hero background/banner image
  // CTA buttons
  cta_primary_text?: string;   // default: "Call or Text 24/7"
  cta_secondary_text?: string; // default: "Book Online"
  // Content
  about_text?: string;         // short about/intro paragraph
  footer_message?: string;     // custom footer text above "Powered by SmallBizAgent"
  // Section toggles
  show_staff?: boolean;        // default true
  show_reviews?: boolean;      // default true
  show_hours?: boolean;        // default true
}

export interface GenerationResult {
  html: string;
  generatedAt: Date;
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert web designer generating complete, production-ready one-page business websites. You output ONLY a single self-contained HTML file with all CSS embedded. No markdown, no explanation, no code fences. Just raw HTML starting with <!DOCTYPE html>.

Rules:
- Use every piece of business data provided. Nothing left out.
- If a field is null or empty, omit that section gracefully. Never show placeholder text, empty sections, or "N/A".
- Mobile responsive. Looks great on phone and desktop.
- Single file. All CSS embedded in <style> tags. No external files.
- No JavaScript frameworks. Vanilla JS only if needed (e.g. smooth scroll, mobile nav toggle).
- Fast loading. No unnecessary dependencies.
- Fonts from Google Fonts only (one link tag in <head>).
- Primary CTA is always the business phone number.
- Always include a prominent badge or banner: "AI Receptionist available 24/7 — Call or text anytime"
- Always include in footer (small, unobtrusive): "Powered by SmallBizAgent"

Booking widget rules:
- If booking_enabled is true and booking_slug is provided:
  - Add a "Book Online" section between Services and Hours
  - Embed the booking widget using this exact iframe:
    <iframe src="{booking_url}" width="100%" height="650px" frameborder="0" style="border-radius:12px; border: none;"></iframe>
  - The booking_url will be provided in the user message — use it exactly as given
  - Add "Book Online" as a secondary CTA button in the hero and nav alongside the phone CTA
  - Phone CTA is always primary: "Call or Text 24/7"
  - Booking CTA is secondary: "Book Online"
  - Section heading: "Book Your Appointment"
  - Section subheading: "Pick a time that works for you"
- If booking_enabled is false or booking_slug is null:
  - Phone number is the only CTA
  - No booking section included

Customization overrides — apply if provided (these are NON-NEGOTIABLE, use exact text):
- accent_color: use this hex instead of vertical preset default
- font_style classic: serif display font, editorial feel
- font_style modern: clean sans-serif, minimal layout
- font_style bold: heavy weight type, high contrast layout
- hero_headline: use this exact text as the hero headline
- hero_subheadline: use this exact text as the hero subheadline/subtitle
- hero_image_url: use as hero background or banner image
- cta_primary_text: use this exact text for the primary CTA button (replaces "Call or Text 24/7")
- cta_secondary_text: use this exact text for the secondary/booking CTA button (replaces "Book Online")
- about_text: add an "About" section after the hero using this exact paragraph text
- footer_message: display this custom text in the footer above the "Powered by SmallBizAgent" line
- show_staff false: omit staff section entirely
- show_reviews false: omit rating and review count
- show_hours false: omit hours section entirely

Vertical design presets — apply based on business_type:
- Barbershop: dark background (#111), gold accents (#C9A84C), Playfair Display serif, luxury editorial feel
- Salon / Beauty: soft cream (#F5EFE0), blush (#E8C4B8), elegant minimal, Cormorant Garamond script accent
- HVAC: clean white, navy (#1B2A4A) and orange (#E87722), bold utilitarian, trust-forward, Barlow font
- Plumbing: white and blue (#1A4B8C), large phone dominant, high contrast, no-nonsense, Source Sans Pro
- Landscaping: deep green (#1A3320), earthy (#8B6914), organic layout, Lato font
- Restaurant: rich dark (#0D0D0D), warm amber (#D4A017), menu-forward, Libre Baskerville
- Dental: clean white, calming sky blue (#4DA8DA), professional medical feel, Inter font
- Medical: clean white, calming blues (#2E86AB), trustworthy, professional, Nunito Sans font
- Automotive: dark charcoal (#1A1A2E), bold red accents (#E63946), industrial sans-serif, Oswald font
- Electrical: navy (#0B132B) and yellow (#FFD60A), technical precision, bold headings, Roboto Condensed
- Cleaning: fresh white and green (#2D6A4F), airy spacing, modern sans-serif, Poppins font
- Construction: concrete gray (#2B2D42), safety orange (#F77F00), rugged bold type, Bebas Neue headers
- Fitness: energetic dark (#0D1117), neon accents (#00F5D4), impact typeface, Montserrat font
- Veterinary: warm earth tones (#8B4513), friendly rounded type, green accents (#3A7D44), Quicksand font
- Default: dark background (#0F0F0F), white text, accent #C9A84C, DM Sans font

Sections to include (only if data exists):
1. Nav — business name/logo, anchor links, Call Now CTA + Book Online CTA (if booking enabled)
2. Hero — headline, subheadline, primary CTA (call/text), secondary CTA (book online if booking enabled)
3. AI receptionist badge — "Answers 24/7, no hold music"
4. Stats bar — years in business, rating + review count, 24/7 badge
5. Services grid — name, price, description per service
6. Booking widget — embedded iframe (if booking enabled)
7. Staff section — photo placeholder, name, role/specialty per staff member
8. Hours table — all 7 days, actual hours from DB, dynamic
9. Location — full address, Get Directions link to Google Maps
10. Social links — if any stored
11. Footer — business name, phone, address, "Powered by SmallBizAgent"`;

// ─── User Message Builder ────────────────────────────────────────────────────

async function buildUserMessage(businessId: number, customizations?: WebsiteCustomizations): Promise<string> {
  // Fetch all business data in parallel
  const [business, hours, servicesList, staffList] = await Promise.all([
    storage.getBusiness(businessId),
    storage.getBusinessHours(businessId),
    storage.getServices(businessId),
    storage.getStaff(businessId),
  ]);

  if (!business) throw new Error('Business not found');

  // Format hours from DB
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const hoursLines: string[] = [];
  for (const day of dayOrder) {
    const h = hours.find(bh => bh.day.toLowerCase() === day);
    const dayName = day.charAt(0).toUpperCase() + day.slice(1);
    if (h && !h.isClosed && h.open && h.close) {
      hoursLines.push(`${dayName}: ${h.open} - ${h.close}`);
    } else if (h && h.isClosed) {
      hoursLines.push(`${dayName}: Closed`);
    }
    // If no entry at all, skip — don't show "N/A"
  }

  // Format services from DB
  const servicesBlock = servicesList
    .filter(s => s.active !== false)
    .map(s => {
      let line = `- Name: ${s.name}`;
      if (s.price) line += `\n  Price: $${s.price}`;
      if (s.duration) line += `\n  Duration: ${s.duration} minutes`;
      if (s.description) line += `\n  Description: ${s.description}`;
      return line;
    }).join('\n');

  // Format staff from DB
  const staffBlock = staffList
    .filter(s => s.active !== false)
    .map(s => {
      let line = `- Name: ${s.firstName} ${s.lastName}`;
      if (s.specialty || s.role) line += `\n  Role: ${s.specialty || s.role}`;
      if (s.bio) line += `\n  Bio: ${s.bio}`;
      if (s.photoUrl) line += `\n  Photo URL: ${s.photoUrl}`;
      return line;
    }).join('\n');

  // Build customization block
  const cust = customizations || {};
  const custLines: string[] = [];
  custLines.push(`- Accent color: ${cust.accent_color || 'use vertical preset default'}`);
  custLines.push(`- Font style: ${cust.font_style || 'classic'}`);
  custLines.push(`- Hero headline override: ${cust.hero_headline || 'null'}`);
  custLines.push(`- Hero subheadline override: ${cust.hero_subheadline || 'null'}`);
  custLines.push(`- Hero image URL: ${cust.hero_image_url || 'null'}`);
  custLines.push(`- Primary CTA button text: ${cust.cta_primary_text || 'Call or Text 24/7'}`);
  custLines.push(`- Secondary CTA button text: ${cust.cta_secondary_text || 'Book Online'}`);
  custLines.push(`- About text: ${cust.about_text || 'null'}`);
  custLines.push(`- Footer message: ${cust.footer_message || 'null'}`);
  custLines.push(`- Show staff section: ${cust.show_staff !== false}`);
  custLines.push(`- Show reviews: ${cust.show_reviews !== false}`);
  custLines.push(`- Show hours: ${cust.show_hours !== false}`);

  // Determine the phone number to display (Twilio AI number)
  const aiPhone = business.twilioPhoneNumber || business.phone || '';

  return `Generate a website for the following business:

Business Name: ${business.name}
Business Type: ${business.type || business.industry || 'General'}
Tagline: ${business.description || 'null'}
Phone: ${business.phone || 'null'}
Email: ${business.email || 'null'}
Address: ${business.address || 'null'}
City: ${business.city || 'null'}, ${business.state || ''} ${business.zip || ''}
Logo URL: ${business.logoUrl || 'null'}
Brand Primary Color: ${business.brandColor || 'null'}

Booking:
- Booking Enabled: ${business.bookingEnabled || false}
- Booking Slug: ${business.bookingSlug || 'null'}
- Booking URL: ${business.bookingEnabled && business.bookingSlug ? `${process.env.APP_URL || 'https://smallbizagent.ai'}/book/${business.bookingSlug}` : 'null'}

Hours (from DB — actual stored values):
${hoursLines.length > 0 ? hoursLines.join('\n') : 'No hours set — omit hours section'}

Services (from DB — all stored services):
${servicesBlock || 'No services set — omit services section'}

Staff (from DB — all stored staff members):
${staffBlock || 'No staff set — omit staff section'}

SmallBizAgent AI Phone Number: ${aiPhone}

Customizations:
${custLines.join('\n')}`;
}

// ─── Generation ──────────────────────────────────────────────────────────────

/**
 * Generate a complete one-page website for a business using OpenAI.
 * Pulls all data from the DB — no hardcoded values.
 */
export async function generateWebsite(
  businessId: number,
  customizations?: WebsiteCustomizations,
): Promise<GenerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  console.log(`[WebsiteGeneration] Generating website for business ${businessId}`);

  const openai = new OpenAI({ apiKey });
  const userMessage = await buildUserMessage(businessId, customizations);

  const response = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    temperature: 0.7,
    max_completion_tokens: 16000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  });

  let html = response.choices[0]?.message?.content?.trim();
  if (!html) throw new Error('OpenAI returned empty response');

  // Strip code fences if present (safety)
  if (html.startsWith('```')) {
    html = html.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '');
  }

  // Validate it's actually HTML
  if (!html.includes('<!DOCTYPE html') && !html.includes('<html')) {
    throw new Error('OpenAI did not return valid HTML');
  }

  console.log(`[WebsiteGeneration] Generated ${html.length} chars of HTML for business ${businessId}`);

  return {
    html,
    generatedAt: new Date(),
  };
}
