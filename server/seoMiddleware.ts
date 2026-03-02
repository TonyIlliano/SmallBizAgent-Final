/**
 * SEO Middleware — Injects dynamic meta tags + JSON-LD structured data
 * into the HTML for public booking pages so Google can index them properly.
 *
 * Without this, Google sees the same generic "SmallBizAgent - Business Management Dashboard"
 * title for every page since it's an SPA that renders client-side.
 */
import { type Request, type Response, type NextFunction } from "express";
import { storage } from "./storage";

// Match /book/<slug> but NOT /book/<slug>/slots, /book/<slug>/manage, etc.
const BOOKING_PAGE_REGEX = /^\/book\/([a-zA-Z0-9_-]+)\/?$/;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Generates the meta tag block + JSON-LD to inject into <head>.
 */
function buildSeoTags(business: any, services: any[], hours: any[]): string {
  const name = business.name || "Business";
  const city = business.city || "";
  const state = business.state || "";
  const location = [city, state].filter(Boolean).join(", ");
  const industry = business.industry || "Business";
  const description =
    business.description ||
    `Book an appointment with ${name}${location ? ` in ${location}` : ""}. Online scheduling powered by SmallBizAgent.`;
  const slug = business.bookingSlug || "";
  const canonicalUrl = `https://www.smallbizagent.ai/book/${slug}`;
  const fullAddress = [business.address, business.city, business.state, business.zip]
    .filter(Boolean)
    .join(", ");

  // Build page title: "Book at Canton Corner Barbershop | Baltimore, MD"
  const pageTitle = `Book at ${name}${location ? ` | ${location}` : ""} - Online Scheduling`;

  // Service list for meta description
  const serviceNames = services
    .slice(0, 5)
    .map((s) => s.name)
    .join(", ");
  const metaDescription = services.length > 0
    ? `Book appointments online with ${name}${location ? ` in ${location}` : ""}. Services: ${serviceNames}${services.length > 5 ? ` and ${services.length - 5} more` : ""}. Easy online scheduling.`
    : description;

  // Build JSON-LD structured data (LocalBusiness schema)
  const jsonLd: any = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: name,
    url: canonicalUrl,
    ...(business.phone && { telephone: business.phone }),
    ...(business.email && { email: business.email }),
    ...(business.website && { sameAs: [business.website] }),
    ...(business.description && { description: business.description }),
    ...(industry && { additionalType: industry }),
  };

  // Address
  if (business.address || business.city) {
    jsonLd.address = {
      "@type": "PostalAddress",
      ...(business.address && { streetAddress: business.address }),
      ...(business.city && { addressLocality: business.city }),
      ...(business.state && { addressRegion: business.state }),
      ...(business.zip && { postalCode: business.zip }),
      addressCountry: "US",
    };
  }

  // Logo
  if (business.logoUrl) {
    jsonLd.image = business.logoUrl;
  }

  // Opening hours from DB
  if (hours && hours.length > 0) {
    const dayMap: Record<string, string> = {
      monday: "Mo", tuesday: "Tu", wednesday: "We", thursday: "Th",
      friday: "Fr", saturday: "Sa", sunday: "Su",
    };
    const openingSpecs: string[] = [];
    for (const h of hours) {
      const dayKey = (h.day || "").toLowerCase();
      const dayAbbr = dayMap[dayKey];
      if (!dayAbbr || h.isClosed || !h.open || !h.close) continue;
      openingSpecs.push(`${dayAbbr} ${h.open}-${h.close}`);
    }
    if (openingSpecs.length > 0) {
      jsonLd.openingHours = openingSpecs;
    }
  }

  // Services as offers
  if (services.length > 0) {
    jsonLd.hasOfferCatalog = {
      "@type": "OfferCatalog",
      name: "Services",
      itemListElement: services.map((s) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: s.name,
          ...(s.description && { description: s.description }),
          ...(s.duration && {
            providerMobility: `${s.duration} minutes`,
          }),
        },
        ...(s.price && {
          price: s.price,
          priceCurrency: "USD",
        }),
      })),
    };
  }

  // Booking action
  jsonLd.potentialAction = {
    "@type": "ReserveAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: canonicalUrl,
      actionPlatform: [
        "http://schema.org/DesktopWebPlatform",
        "http://schema.org/MobileWebPlatform",
      ],
    },
    result: {
      "@type": "Reservation",
      name: `Appointment at ${name}`,
    },
  };

  const jsonLdStr = JSON.stringify(jsonLd);

  // Meta tags to inject (will replace the defaults in <head>)
  return `
    <!-- Dynamic SEO for booking page -->
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(metaDescription)}">
    <meta name="keywords" content="${escapeHtml(name)}, ${escapeHtml(industry)}, ${escapeHtml(location)}, book appointment, online booking, schedule">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">

    <!-- Open Graph -->
    <meta property="og:type" content="business.business">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta property="og:title" content="${escapeHtml(pageTitle)}">
    <meta property="og:description" content="${escapeHtml(metaDescription)}">
    ${business.logoUrl ? `<meta property="og:image" content="${escapeHtml(business.logoUrl)}">` : ""}
    <meta property="og:site_name" content="SmallBizAgent">
    ${fullAddress ? `<meta property="business:contact_data:street_address" content="${escapeHtml(business.address || "")}">
    <meta property="business:contact_data:locality" content="${escapeHtml(business.city || "")}">
    <meta property="business:contact_data:region" content="${escapeHtml(business.state || "")}">
    <meta property="business:contact_data:postal_code" content="${escapeHtml(business.zip || "")}">
    <meta property="business:contact_data:country_name" content="US">` : ""}
    ${business.phone ? `<meta property="business:contact_data:phone_number" content="${escapeHtml(business.phone)}">` : ""}

    <!-- Twitter -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
    <meta name="twitter:description" content="${escapeHtml(metaDescription)}">
    ${business.logoUrl ? `<meta name="twitter:image" content="${escapeHtml(business.logoUrl)}">` : ""}

    <!-- Geo -->
    ${business.city && business.state ? `<meta name="geo.placename" content="${escapeHtml(location)}">
    <meta name="geo.region" content="US-${escapeHtml(business.state)}">` : ""}

    <!-- JSON-LD Structured Data -->
    <script type="application/ld+json">${jsonLdStr}</script>`;
}

/**
 * Injects dynamic SEO tags into the HTML template for /book/:slug pages.
 * Returns a modified HTML string or null if this isn't a booking page.
 */
export async function injectBookingSeo(url: string, html: string): Promise<string | null> {
  const match = url.match(BOOKING_PAGE_REGEX);
  if (!match) return null;

  const slug = match[1];

  try {
    const business = await storage.getBusinessByBookingSlug(slug);
    if (!business || !business.bookingEnabled) return null;

    // Fetch services and hours for structured data
    const allServices = await storage.getServices(business.id);
    const services = allServices.filter((s) => s.active);
    const hours = await storage.getBusinessHours(business.id);

    const seoTags = buildSeoTags(business, services, hours);

    // Replace the default <title> and meta tags
    let modified = html;

    // Replace <title>
    modified = modified.replace(
      /<title>.*?<\/title>/,
      "" // Remove — our injected block has its own <title>
    );

    // Remove default meta description (we'll inject a better one)
    modified = modified.replace(
      /<meta name="description" content="SmallBizAgent[^"]*">/,
      ""
    );

    // Remove default canonical (we'll inject the correct one)
    modified = modified.replace(
      /<link rel="canonical" href="https:\/\/www\.smallbizagent\.ai\/">/,
      ""
    );

    // Remove default OG tags (we'll inject business-specific ones)
    modified = modified.replace(
      /<!-- Open Graph \/ Facebook -->[\s\S]*?<!-- Twitter -->/,
      "<!-- Open Graph + Twitter: replaced by dynamic SEO -->\n    <!-- Twitter -->"
    );
    modified = modified.replace(
      /<!-- Twitter -->[\s\S]*?<meta name="twitter:image"[^>]*>/,
      ""
    );

    // Inject our SEO tags right before </head>
    modified = modified.replace("</head>", `${seoTags}\n  </head>`);

    return modified;
  } catch (error) {
    console.error(`SEO middleware error for /book/${slug}:`, error);
    return null; // Fall through to default HTML
  }
}

/**
 * Express middleware — intercepts booking page requests to inject SEO.
 * Used in production mode (serveStatic).
 */
export function bookingSeoMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const url = req.originalUrl || req.url;
    if (!BOOKING_PAGE_REGEX.test(url)) {
      return next();
    }

    // Only intercept HTML page requests (not API calls, not asset requests)
    const accept = req.headers.accept || "";
    if (!accept.includes("text/html")) {
      return next();
    }

    next(); // Let this fall through — we handle it in the catch-all by modifying the HTML
  };
}
