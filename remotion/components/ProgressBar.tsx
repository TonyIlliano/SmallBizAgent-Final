import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND } from "../utils/colors";

interface ProgressBarProps {
  height?: number;
  color?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  height = 3,
  color = BRAND.accent,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = (frame / durationInFrames) * 100;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height,
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        zIndex: 110,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          backgroundColor: color,
          borderRadius: height > 2 ? 1 : 0,
          transition: "none",
        }}
      />
    </div>
  );
};
