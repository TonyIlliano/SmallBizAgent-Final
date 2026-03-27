import React from "react";
import { useCurrentFrame, interpolate, AbsoluteFill } from "remotion";

interface SceneTransitionProps {
  startFrame: number;
  durationFrames: number;
  transitionFrames?: number;
  children: React.ReactNode;
}

export const SceneTransition: React.FC<SceneTransitionProps> = ({
  startFrame,
  durationFrames,
  transitionFrames = 15,
  children,
}) => {
  const frame = useCurrentFrame();

  const endFrame = startFrame + durationFrames;

  // Fade in: opacity 0 → 1 over transitionFrames at the start
  const fadeIn = interpolate(
    frame,
    [startFrame, startFrame + transitionFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  // Fade out: opacity 1 → 0 over transitionFrames at the end
  const fadeOut = interpolate(
    frame,
    [endFrame - transitionFrames, endFrame],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  // Combined: use the minimum of fade-in and fade-out
  const opacity = Math.min(fadeIn, fadeOut);

  // Don't render at all outside the scene's frame range
  if (frame < startFrame || frame > endFrame) {
    return null;
  }

  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};
