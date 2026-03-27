import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
} from "remotion";
import type { FC } from "react";
import {
  BRAND,
  FONT_FAMILY,
  SPRING_CONFIGS,
  getContentPadding,
  getResponsiveFontSize,
  gradientBg,
  type AspectRatio,
} from "../utils";

interface SplitCompareSceneProps {
  beforeItems: string[];
  afterItems: string[];
  beforeTitle?: string;
  afterTitle?: string;
  startFrame: number;
  durationFrames: number;
  aspectRatio: AspectRatio;
}

const SplitCompareScene: FC<SplitCompareSceneProps> = ({
  beforeItems,
  afterItems,
  beforeTitle = "Without SmallBizAgent",
  afterTitle = "With SmallBizAgent",
  startFrame,
  durationFrames,
  aspectRatio,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;

  if (localFrame < 0 || localFrame >= durationFrames) {
    return null;
  }

  const isVertical = aspectRatio === "9:16";
  const midpoint = Math.floor(durationFrames * 0.45);
  const itemStagger = 12;
  const padding = getContentPadding(aspectRatio);
  const titleFontSize = getResponsiveFontSize(28, aspectRatio);
  const itemFontSize = getResponsiveFontSize(20, aspectRatio);

  // Divider sweep from left to right (or top to bottom)
  const dividerProgress = interpolate(
    localFrame - midpoint,
    [0, 20],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    },
  );

  // Before title fade
  const beforeTitleOpacity = interpolate(localFrame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // After title fade (after midpoint)
  const afterTitleOpacity = interpolate(
    localFrame - midpoint - 5,
    [0, 12],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill>
      <AbsoluteFill style={gradientBg(BRAND.primary, BRAND.primaryLight, 180)} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: isVertical ? "column" : "row",
          padding,
        }}
      >
        {/* BEFORE side */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: isVertical ? "center" : "flex-start",
            padding: isVertical ? "20px 0" : "0 24px",
            backgroundColor: "rgba(248, 113, 113, 0.06)",
            borderRadius: 12,
          }}
        >
          <h3
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: titleFontSize,
              fontWeight: 700,
              color: BRAND.danger,
              opacity: beforeTitleOpacity,
              margin: "0 0 20px 0",
              textAlign: isVertical ? "center" : "left",
            }}
          >
            {beforeTitle}
          </h3>

          {beforeItems.map((item, i) => {
            const delay = 8 + i * itemStagger;
            const progress = interpolate(localFrame - delay, [0, 14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            });
            const translateX = isVertical ? 0 : interpolate(progress, [0, 1], [-20, 0]);

            return (
              <div
                key={`before-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 12,
                  opacity: progress,
                  transform: `translateX(${translateX}px)`,
                }}
              >
                <span style={{ color: BRAND.danger, fontSize: 18, fontWeight: 700 }}>
                  ✗
                </span>
                <span
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontSize: itemFontSize,
                    color: BRAND.textPrimary,
                    fontWeight: 400,
                  }}
                >
                  {item}
                </span>
              </div>
            );
          })}
        </div>

        {/* Divider sweep line */}
        <div
          style={{
            width: isVertical ? "100%" : 3,
            height: isVertical ? 3 : "100%",
            position: "relative",
            flexShrink: 0,
            margin: isVertical ? "8px 0" : "0 8px",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: isVertical ? `${dividerProgress * 100}%` : "100%",
              height: isVertical ? "100%" : `${dividerProgress * 100}%`,
              backgroundColor: BRAND.accent,
              borderRadius: 2,
              boxShadow: `0 0 12px ${BRAND.accent}66`,
            }}
          />
        </div>

        {/* AFTER side */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: isVertical ? "center" : "flex-start",
            padding: isVertical ? "20px 0" : "0 24px",
            backgroundColor: "rgba(52, 211, 153, 0.06)",
            borderRadius: 12,
          }}
        >
          <h3
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: titleFontSize,
              fontWeight: 700,
              color: BRAND.success,
              opacity: afterTitleOpacity,
              margin: "0 0 20px 0",
              textAlign: isVertical ? "center" : "left",
            }}
          >
            {afterTitle}
          </h3>

          {afterItems.map((item, i) => {
            const delay = midpoint + 10 + i * itemStagger;
            const progress = interpolate(localFrame - delay, [0, 14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            });
            const translateX = isVertical ? 0 : interpolate(progress, [0, 1], [20, 0]);

            return (
              <div
                key={`after-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 12,
                  opacity: progress,
                  transform: `translateX(${translateX}px)`,
                }}
              >
                <span style={{ color: BRAND.success, fontSize: 18, fontWeight: 700 }}>
                  ✓
                </span>
                <span
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontSize: itemFontSize,
                    color: BRAND.textPrimary,
                    fontWeight: 400,
                  }}
                >
                  {item}
                </span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default SplitCompareScene;
