import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { BRAND } from "../utils/colors";

interface GradientBackgroundProps {
  from?: string;
  to?: string;
  style?: React.CSSProperties;
}

export const GradientBackground: React.FC<GradientBackgroundProps> = ({
  from = BRAND.primary,
  to = BRAND.primaryLight,
  style,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Subtle angle rotation over time (135deg → 145deg)
  const angle = interpolate(frame, [0, durationInFrames], [135, 145], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `linear-gradient(${angle}deg, ${from} 0%, ${to} 50%, ${BRAND.primary} 100%)`,
        ...style,
      }}
    />
  );
};
