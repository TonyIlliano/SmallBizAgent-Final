import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
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

interface HookSceneProps {
  text: string;
  startFrame: number;
  durationFrames: number;
  aspectRatio: AspectRatio;
}

const HookScene: FC<HookSceneProps> = ({
  text,
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

  const words = text.split(" ");
  const wordStagger = 4;
  const totalWordFrames = words.length * wordStagger;

  // After all words are shown, draw the accent line
  const lineDelay = totalWordFrames + 10;
  const lineWidth = animations.lineExpand(localFrame, lineDelay, 200, 20);

  const padding = getContentPadding(aspectRatio);
  const fontSize = getResponsiveFontSize(54, aspectRatio);

  return (
    <AbsoluteFill>
      {/* Gradient background: navy to dark blue */}
      <AbsoluteFill style={gradientBg(BRAND.primary, BRAND.primaryLight, 135)} />

      {/* Word container */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
            maxWidth: aspectRatio === "9:16" ? "90%" : "80%",
          }}
        >
          {words.map((word, i) => {
            const wordDelay = i * wordStagger;
            const s = spring({
              frame: localFrame - wordDelay,
              fps,
              config: SPRING_CONFIGS.smooth,
              durationInFrames: 30,
            });

            const opacity = s;
            const translateY = interpolate(s, [0, 1], [30, 0]);

            return (
              <span
                key={`${word}-${i}`}
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize,
                  fontWeight: 700,
                  color: BRAND.textPrimary,
                  opacity,
                  transform: `translateY(${translateY}px)`,
                  display: "inline-block",
                  lineHeight: 1.3,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>

        {/* Teal accent line expanding from center */}
        <div
          style={{
            marginTop: 32,
            height: 3,
            width: lineWidth,
            backgroundColor: BRAND.accent,
            borderRadius: 2,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default HookScene;
