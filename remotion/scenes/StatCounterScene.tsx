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
  animations,
  getContentPadding,
  getResponsiveFontSize,
  gradientBg,
  type AspectRatio,
} from "../utils";

interface StatItem {
  value: number;
  label: string;
  suffix?: string;
}

interface StatCounterSceneProps {
  stats: StatItem[];
  startFrame: number;
  durationFrames: number;
  aspectRatio: AspectRatio;
}

const StatCounterScene: FC<StatCounterSceneProps> = ({
  stats,
  startFrame,
  durationFrames,
  aspectRatio,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // frame is already relative inside <Sequence> — no offset needed
  const localFrame = frame;

  const statStagger = 20;
  const countDuration = 45;
  const isVertical = aspectRatio === "9:16";
  const padding = getContentPadding(aspectRatio);
  const numberFontSize = getResponsiveFontSize(64, aspectRatio);
  const labelFontSize = getResponsiveFontSize(18, aspectRatio);
  const suffixFontSize = getResponsiveFontSize(40, aspectRatio);

  return (
    <AbsoluteFill>
      <AbsoluteFill style={gradientBg(BRAND.primary, BRAND.primaryLight, 160)} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: isVertical ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          padding,
          gap: isVertical ? 48 : 60,
        }}
      >
        {stats.map((stat, i) => {
          const delay = i * statStagger;

          // Number counting animation
          const countProgress = interpolate(
            localFrame - delay,
            [0, countDuration],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            },
          );
          const displayValue = Math.floor(countProgress * stat.value);

          // Scale bounce on the number
          const scaleSpring = spring({
            frame: localFrame - delay,
            fps,
            config: SPRING_CONFIGS.bouncy,
            durationInFrames: 30,
          });
          const numberScale = interpolate(scaleSpring, [0, 1], [0.3, 1]);

          // Label fades in 10 frames after number reaches target
          const labelDelay = delay + countDuration + 10;
          const labelOpacity = interpolate(
            localFrame - labelDelay,
            [0, 12],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );
          const labelTranslateY = interpolate(
            localFrame - labelDelay,
            [0, 12],
            [8, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            },
          );

          // Suffix slides in from right after number finishes
          const suffixDelay = delay + countDuration;
          const suffixProgress = interpolate(
            localFrame - suffixDelay,
            [0, 10],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            },
          );
          const suffixTranslateX = interpolate(suffixProgress, [0, 1], [12, 0]);

          return (
            <div
              key={`stat-${i}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              {/* Number + suffix row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  transform: `scale(${numberScale})`,
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontSize: numberFontSize,
                    fontWeight: 800,
                    color: BRAND.accent,
                    letterSpacing: -1,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {displayValue.toLocaleString()}
                </span>

                {stat.suffix && (
                  <span
                    style={{
                      fontFamily: FONT_FAMILY,
                      fontSize: suffixFontSize,
                      fontWeight: 700,
                      color: BRAND.accent,
                      opacity: suffixProgress,
                      transform: `translateX(${suffixTranslateX}px)`,
                      marginLeft: 2,
                    }}
                  >
                    {stat.suffix}
                  </span>
                )}
              </div>

              {/* Label */}
              <span
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize: labelFontSize,
                  fontWeight: 500,
                  color: BRAND.textSecondary,
                  opacity: labelOpacity,
                  transform: `translateY(${labelTranslateY}px)`,
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                }}
              >
                {stat.label}
              </span>
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default StatCounterScene;
