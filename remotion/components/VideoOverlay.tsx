import React from "react";

interface VideoOverlayProps {
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const VideoOverlay: React.FC<VideoOverlayProps> = ({
  borderRadius = 16,
  borderColor = "#1e293b",
  borderWidth = 2,
  children,
  style,
}) => {
  return (
    <div
      style={{
        overflow: "hidden",
        borderRadius,
        border: `${borderWidth}px solid ${borderColor}`,
        boxShadow: `0 8px 32px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15)`,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {children}
    </div>
  );
};
