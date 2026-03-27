import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
  OffthreadVideo,
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

interface FeatureHighlightSceneProps {
  features: string[];
  clipUrl?: string;
  startFrame: number;
  durationFrames: number;
  aspectRatio: AspectRatio;
}

const FeatureHighlightScene: FC<FeatureHighlightSceneProps> = ({
  features,
  clipUrl,
  startFrame,
  durationFrames,
  aspectRatio,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // frame is already relative inside <Sequence> — no offset needed
  const localFrame = frame;

  const isVertical = aspectRatio === "9:16";
  const featureStagger = 20;
  const padding = getContentPadding(aspectRatio);
  const featureFontSize = getResponsiveFontSize(22, aspectRatio);

  const dividerDelay = 5;
  const dividerProgress = interpolate(
    localFrame - dividerDelay,
    [0, 30],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  const floatY = 8 * Math.sin((localFrame / 120) * Math.PI * 2);

  return (
    <AbsoluteFill>
      <AbsoluteFill style={gradientBg(BRAND.primary, BRAND.primaryLight, 150)} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: isVertical ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          padding,
          gap: 0,
        }}
      >
        {/* Left / Top panel: features */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: isVertical ? 16 : 20,
            paddingRight: isVertical ? 0 : 32,
            paddingBottom: isVertical ? 20 : 0,
            width: "100%",
          }}
        >
          {features.map((feature, i) => {
            const delay = i * featureStagger;

            const checkSpring = spring({
              frame: localFrame - delay,
              fps,
              config: SPRING_CONFIGS.bouncy,
              durationInFrames: 25,
            });
            const checkScale = interpolate(checkSpring, [0, 1], [0, 1]);

            const textProgress = interpolate(
              localFrame - delay,
              [0, 18],
              [0, 1],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              },
            );
            const textTranslateX = interpolate(textProgress, [0, 1], [-30, 0]);

            return (
              <div
                key={`feature-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: `${BRAND.accent}22`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transform: `scale(${checkScale})`,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      color: BRAND.accent,
                      fontSize: 16,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    ✓
                  </span>
                </div>

                <span
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontSize: featureFontSize,
                    fontWeight: 500,
                    color: BRAND.textPrimary,
                    opacity: textProgress,
                    transform: `translateX(${textTranslateX}px)`,
                    lineHeight: 1.4,
                  }}
                >
                  {feature}
                </span>
              </div>
            );
          })}
        </div>

        {/* Divider line between panels */}
        <div
          style={{
            width: isVertical ? `${dividerProgress * 80}%` : 2,
            height: isVertical ? 2 : `${dividerProgress * 70}%`,
            backgroundColor: BRAND.accent,
            opacity: 0.4,
            borderRadius: 1,
            flexShrink: 0,
            margin: isVertical ? "8px 0" : "0 8px",
          }}
        />

        {/* Right / Bottom panel: video clip */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            maxHeight: isVertical ? "40%" : "100%",
          }}
        >
          {clipUrl ? (
            <div
              style={{
                width: isVertical ? "90%" : "85%",
                height: isVertical ? "100%" : "75%",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
                transform: `translateY(${floatY}px)`,
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
          ) : (
            <div
              style={{
                width: isVertical ? "80%" : "75%",
                height: isVertical ? "100%" : "65%",
                borderRadius: 12,
                background: `linear-gradient(135deg, ${BRAND.accent}22, ${BRAND.primaryLight})`,
                border: `1px solid ${BRAND.accent}33`,
                transform: `translateY(${floatY}px)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize: 48,
                  opacity: 0.3,
                }}
              >
                ▶
              </span>
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default FeatureHighlightScene;
