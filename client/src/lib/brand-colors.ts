import type { CSSProperties } from "react";

/**
 * Convert a hex color (#rrggbb) to HSL string format used by Tailwind CSS variables.
 * Returns format: "210 100% 50%" (space-separated, matching Tailwind/shadcn convention)
 */
export function hexToHSL(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Determine the appropriate foreground color (white or dark) for text on a given background.
 * Uses relative luminance to ensure readable contrast.
 * Returns an HSL string for use as --primary-foreground.
 */
export function getContrastForeground(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Relative luminance formula (perceived brightness)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  // Light backgrounds get dark text, dark backgrounds get white text
  return luminance > 0.5 ? "0 0% 9%" : "0 0% 100%";
}

/**
 * Build CSS custom property overrides for white-label branding on booking pages.
 * When applied to a container element via `style`, this overrides --primary
 * so all Tailwind classes (bg-primary, text-primary, from-primary, etc.) use the brand color.
 *
 * Returns an empty object if no valid brand color is provided (graceful fallback to defaults).
 */
export function getBrandStyles(
  brandColor: string | null | undefined
): CSSProperties {
  if (!brandColor || !/^#[0-9a-fA-F]{6}$/.test(brandColor)) return {};

  return {
    "--primary": hexToHSL(brandColor),
    "--primary-foreground": getContrastForeground(brandColor),
    "--ring": hexToHSL(brandColor),
  } as CSSProperties;
}
