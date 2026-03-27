import { spring, interpolate, Easing } from "remotion";

// ─── Brand Constants ───────────────────────────────────────────────
export const BRAND = {
  primary: "#0f172a",
  primaryLight: "#1e293b",
  accent: "#14B8A6",
  accentLight: "#2dd4bf",
  gold: "#fbbf24",
  white: "#ffffff",
  textPrimary: "#f8fafc",
  textSecondary: "#94a3b8",
  danger: "#f87171",
  success: "#34d399",
  cardBg: "#1e293b",
  url: "smallbizagent.ai",
} as const;

export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// ─── Spring Configs ────────────────────────────────────────────────
export const SPRING_CONFIGS = {
  smooth: { damping: 15, mass: 0.8, stiffness: 80 },
  bouncy: { damping: 10, mass: 0.6, stiffness: 120 },
  snappy: { damping: 20, mass: 0.5, stiffness: 200 },
  gentle: { damping: 18, mass: 1, stiffness: 60 },
} as const;

// ─── Responsive Helpers ────────────────────────────────────────────
export type AspectRatio = "16:9" | "9:16";

export function getContentPadding(aspectRatio: AspectRatio): string {
  return aspectRatio === "9:16" ? "60px 32px" : "40px 80px";
}

export function getResponsiveFontSize(
  base: number,
  aspectRatio: AspectRatio,
): number {
  return aspectRatio === "9:16" ? base * 0.85 : base;
}

// ─── Animation Helpers ─────────────────────────────────────────────
export const animations = {
  fadeSlideIn(
    frame: number,
    fps: number,
    delay: number,
    config = SPRING_CONFIGS.smooth,
  ) {
    const s = spring({ frame: frame - delay, fps, config, durationInFrames: 30 });
    return {
      opacity: s,
      translateY: interpolate(s, [0, 1], [30, 0]),
    };
  },

  scaleIn(
    frame: number,
    fps: number,
    delay: number,
    config = SPRING_CONFIGS.smooth,
  ) {
    const s = spring({ frame: frame - delay, fps, config, durationInFrames: 30 });
    return {
      scale: interpolate(s, [0, 1], [0, 1]),
      opacity: s,
    };
  },

  scaleBounce(
    frame: number,
    fps: number,
    delay: number,
    config = SPRING_CONFIGS.bouncy,
  ) {
    const s = spring({ frame: frame - delay, fps, config, durationInFrames: 30 });
    return {
      scale: interpolate(s, [0, 1], [0, 1.2]),
      opacity: Math.min(s * 2, 1),
    };
  },

  fadeIn(frame: number, delay: number, duration: number) {
    return {
      opacity: interpolate(frame - delay, [0, duration], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    };
  },

  float(frame: number, amplitude: number, period: number) {
    return {
      translateY: amplitude * Math.sin((frame / period) * Math.PI * 2),
    };
  },

  lineExpand(
    frame: number,
    delay: number,
    targetWidth: number,
    duration: number,
  ) {
    return interpolate(frame - delay, [0, duration], [0, targetWidth], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
  },

  typewriter(frame: number, delay: number, totalChars: number, framesPerChar = 2) {
    const elapsed = Math.max(0, frame - delay);
    return Math.min(Math.floor(elapsed / framesPerChar), totalChars);
  },

  countUp(
    frame: number,
    delay: number,
    target: number,
    duration: number,
  ) {
    const progress = interpolate(frame - delay, [0, duration], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    return Math.floor(progress * target);
  },
} as const;

// ─── Gradient Backgrounds ──────────────────────────────────────────
export function gradientBg(
  from: string = BRAND.primary,
  to: string = BRAND.primaryLight,
  angle = 135,
): React.CSSProperties {
  return {
    background: `linear-gradient(${angle}deg, ${from}, ${to})`,
  };
}
