import { spring, interpolate, Easing } from "remotion";

export const SPRING_CONFIGS = {
  snappy: { damping: 12, mass: 0.5, stiffness: 200 },
  smooth: { damping: 15, mass: 0.8, stiffness: 120 },
  bouncy: {
    damping: 8,
    mass: 0.6,
    stiffness: 180,
    overshootClamping: false,
  },
  gentle: { damping: 20, mass: 1.0, stiffness: 80 },
} as const;

export function fadeIn(
  frame: number,
  startFrame: number,
  durationFrames: number = 15
): number {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export function fadeOut(
  frame: number,
  endFrame: number,
  durationFrames: number = 15
): number {
  return interpolate(
    frame,
    [endFrame - durationFrames, endFrame],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );
}

export function slideIn(
  frame: number,
  fps: number,
  startFrame: number,
  direction: "left" | "right" | "up" | "down",
  distance: number = 80
): number {
  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: SPRING_CONFIGS.snappy,
  });

  const sign =
    direction === "right" || direction === "down" ? 1 : -1;

  return interpolate(progress, [0, 1], [sign * distance, 0]);
}

export function typewriterText(
  text: string,
  frame: number,
  startFrame: number,
  framesPerChar: number = 1
): string {
  const elapsed = Math.max(0, frame - startFrame);
  const charsToShow = Math.floor(elapsed / framesPerChar);
  return text.slice(0, Math.min(charsToShow, text.length));
}

export function wordReveal(
  text: string,
  frame: number,
  startFrame: number,
  framesPerWord: number = 3
): string {
  const elapsed = Math.max(0, frame - startFrame);
  const wordsToShow = Math.floor(elapsed / framesPerWord);
  const words = text.split(" ");
  return words.slice(0, Math.min(wordsToShow, words.length)).join(" ");
}

export function scaleBounce(
  frame: number,
  fps: number,
  startFrame: number
): number {
  return spring({
    frame: frame - startFrame,
    fps,
    config: SPRING_CONFIGS.bouncy,
  });
}

export function kenBurns(
  frame: number,
  startFrame: number,
  durationFrames: number,
  config: {
    startScale?: number;
    endScale?: number;
    startX?: number;
    endX?: number;
    startY?: number;
    endY?: number;
  } = {}
): { scale: number; translateX: number; translateY: number } {
  const {
    startScale = 1.0,
    endScale = 1.1,
    startX = 0,
    endX = 0,
    startY = 0,
    endY = 0,
  } = config;

  const progress = interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.ease),
    }
  );

  return {
    scale: interpolate(progress, [0, 1], [startScale, endScale]),
    translateX: interpolate(progress, [0, 1], [startX, endX]),
    translateY: interpolate(progress, [0, 1], [startY, endY]),
  };
}

export function getStaggerDelay(
  index: number,
  staggerFrames: number = 8
): number {
  return index * staggerFrames;
}
