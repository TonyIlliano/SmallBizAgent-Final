import React from "react";
import { useCurrentFrame, interpolate, Img } from "remotion";
import { BRAND } from "../utils/colors";
import { FONT_FAMILY } from "../utils/fonts";

interface BrandBarProps {
  logoUrl?: string;
  brandUrl?: string;
  startFrame: number;
  endFrame: number;
  position?: "top" | "bottom";
  aspectRatio?: "16:9" | "9:16";
}

export const BrandBar: React.FC<BrandBarProps> = ({
  logoUrl,
  brandUrl = "smallbizagent.ai",
  startFrame,
  endFrame,
  position = "bottom",
  aspectRatio = "16:9",
}) => {
  const frame = useCurrentFrame();

  const fadeInEnd = startFrame + 15;
  const fadeOutStart = endFrame - 15;

  // Fade in over 15 frames starting at startFrame
  const fadeIn = interpolate(frame, [startFrame, fadeInEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fade out over 15 frames ending at endFrame
  const fadeOut = interpolate(frame, [fadeOutStart, endFrame], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Combined opacity: use fade-in until fully visible, then fade-out near end
  const opacity = Math.min(fadeIn, fadeOut);

  // Don't render outside the visible range
  if (frame < startFrame || frame > endFrame) {
    return null;
  }

  const barHeight = aspectRatio === "9:16" ? 36 : 40;
  const fontSize = aspectRatio === "9:16" ? 13 : 14;
  const logoHeight = aspectRatio === "9:16" ? 20 : 24;
  const horizontalPadding = aspectRatio === "9:16" ? 16 : 24;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        ...(position === "bottom" ? { bottom: 0 } : { top: 0 }),
        height: barHeight,
        backgroundColor: "rgba(15, 23, 42, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: horizontalPadding,
        paddingRight: horizontalPadding,
        opacity,
        zIndex: 100,
      }}
    >
      {/* Logo on the left */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {logoUrl ? (
          <Img
            src={logoUrl}
            style={{
              height: logoHeight,
              width: "auto",
              objectFit: "contain",
            }}
          />
        ) : (
          <div
            style={{
              width: logoHeight,
              height: logoHeight,
              borderRadius: 4,
              backgroundColor: BRAND.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: logoHeight * 0.5,
              fontWeight: 800,
              color: BRAND.white,
              fontFamily: FONT_FAMILY,
            }}
          >
            S
          </div>
        )}
      </div>

      {/* Brand URL on the right */}
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontSize,
          fontWeight: 600,
          color: BRAND.accent,
          letterSpacing: "0.02em",
        }}
      >
        {brandUrl}
      </div>
    </div>
  );
};
