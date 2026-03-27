import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  OffthreadVideo,
  spring,
} from "remotion";
import type { FC } from "react";
import {
  BRAND,
  FONT_FAMILY,
  SPRING_CONFIGS,
  getContentPadding,
  gradientBg,
  type AspectRatio,
} from "../utils";

interface DemoClipSceneProps {
  clipUrl: string;
  startFrame: number;
  durationFrames: number;
  label?: string;
  zoomTarget?: { x: number; y: number };
  zoomScale?: number;
  aspectRatio: AspectRatio;
}

const DemoClipScene: FC<DemoClipSceneProps> = ({
  clipUrl,
  startFrame,
  durationFrames,
  label,
  zoomTarget = { x: 0.5, y: 0.5 },
  zoomScale = 1.3,
  aspectRatio,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // frame is already relative inside <Sequence> — no offset needed
  const localFrame = frame;

  // Ken Burns zoom: scale interpolates 1.0 → zoomScale over duration
  const scale = interpolate(localFrame, [0, durationFrames], [1.0, zoomScale], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  // Calculate translation based on zoom target to keep focal point centered
  const translateX = (0.5 - zoomTarget.x) * (scale - 1) * 100;
  const translateY = (0.5 - zoomTarget.y) * (scale - 1) * 100;

  // Label fade in
  const labelOpacity = label
    ? interpolate(localFrame - 20, [0, 15], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  const labelSlideY = label
    ? interpolate(localFrame - 20, [0, 15], [10, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;

  const clipPadding = aspectRatio === "9:16" ? "40px 20px" : "30px 60px";
  const clipBorderRadius = 16;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={gradientBg(BRAND.primary, BRAND.primaryLight, 180)} />

      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: clipPadding,
        }}
      >
        {/* Video overlay wrapper with rounded corners */}
        <div
          style={{
            position: "relative",
            width: aspectRatio === "9:16" ? "92%" : "85%",
            height: aspectRatio === "9:16" ? "70%" : "80%",
            borderRadius: clipBorderRadius,
            overflow: "hidden",
            boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${BRAND.accent}33`,
          }}
        >
          {/* Ken Burns clip */}
          <div
            style={{
              width: "100%",
              height: "100%",
              transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
              transformOrigin: "center center",
            }}
          >
            <OffthreadVideo
              src={clipUrl}
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>

          {/* Optional label at bottom */}
          {label && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "12px 20px",
                background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
                opacity: labelOpacity,
                transform: `translateY(${labelSlideY}px)`,
              }}
            >
              <span
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize: 18,
                  fontWeight: 600,
                  color: BRAND.textPrimary,
                  letterSpacing: 0.3,
                }}
              >
                {label}
              </span>
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default DemoClipScene;
