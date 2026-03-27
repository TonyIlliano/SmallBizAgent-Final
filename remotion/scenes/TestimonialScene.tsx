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

interface TestimonialSceneProps {
  quote: string;
  attribution: string;
  starCount: 1 | 2 | 3 | 4 | 5;
  startFrame: number;
  durationFrames: number;
  aspectRatio: AspectRatio;
}

const TestimonialScene: FC<TestimonialSceneProps> = ({
  quote,
  attribution,
  starCount,
  startFrame,
  durationFrames,
  aspectRatio,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // frame is already relative inside <Sequence> — no offset needed
  const localFrame = frame;

  const padding = getContentPadding(aspectRatio);
  const quoteFontSize = getResponsiveFontSize(24, aspectRatio);
  const attrFontSize = getResponsiveFontSize(18, aspectRatio);

  // Card scales from 0.9 to 1.0
  const cardSpring = spring({
    frame: localFrame,
    fps,
    config: SPRING_CONFIGS.smooth,
    durationInFrames: 35,
  });
  const cardScale = interpolate(cardSpring, [0, 1], [0.9, 1.0]);
  const cardOpacity = cardSpring;

  // Opening quotation mark
  const quoteMarkOpacity = interpolate(localFrame, [5, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const quoteMarkRotation = interpolate(localFrame, [5, 18], [-5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Quote text word-by-word reveal
  const words = quote.split(" ");
  const wordRevealStart = 12;
  const framesPerWord = 3;

  // Attribution fade + slide
  const attrDelay = wordRevealStart + words.length * framesPerWord + 10;
  const attrProgress = interpolate(localFrame - attrDelay, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const attrTranslateY = interpolate(attrProgress, [0, 1], [20, 0]);

  return (
    <AbsoluteFill>
      <AbsoluteFill style={gradientBg(BRAND.primary, BRAND.primaryLight, 160)} />

      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding,
        }}
      >
        {/* Card container */}
        <div
          style={{
            backgroundColor: BRAND.cardBg,
            borderRadius: 20,
            padding: aspectRatio === "9:16" ? "40px 28px" : "48px 56px",
            maxWidth: aspectRatio === "9:16" ? "92%" : "75%",
            width: "100%",
            transform: `scale(${cardScale})`,
            opacity: cardOpacity,
            boxShadow: `0 8px 40px rgba(0,0,0,0.4), 0 0 0 1px ${BRAND.accent}22`,
          }}
        >
          {/* Stars */}
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 20,
              justifyContent: "center",
            }}
          >
            {Array.from({ length: starCount }).map((_, i) => {
              const starSpring = spring({
                frame: localFrame - i * 6,
                fps,
                config: SPRING_CONFIGS.bouncy,
                durationInFrames: 20,
              });
              const starScale = interpolate(starSpring, [0, 1], [0, 1]);

              return (
                <span
                  key={`star-${i}`}
                  style={{
                    fontSize: 28,
                    color: BRAND.gold,
                    transform: `scale(${starScale})`,
                    display: "inline-block",
                  }}
                >
                  ★
                </span>
              );
            })}
          </div>

          {/* Opening quotation mark */}
          <div
            style={{
              opacity: quoteMarkOpacity,
              transform: `rotate(${quoteMarkRotation}deg)`,
              fontSize: 64,
              fontFamily: "Georgia, serif",
              color: BRAND.accent,
              lineHeight: 0.5,
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            "
          </div>

          {/* Quote text - word by word reveal */}
          <p
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: quoteFontSize,
              fontWeight: 400,
              color: BRAND.textPrimary,
              lineHeight: 1.6,
              textAlign: "center",
              margin: "0 0 24px 0",
              fontStyle: "italic",
            }}
          >
            {words.map((word, i) => {
              const wordDelay = wordRevealStart + i * framesPerWord;
              const wordOpacity = interpolate(
                localFrame - wordDelay,
                [0, framesPerWord],
                [0, 1],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              );
              return (
                <span key={`word-${i}`} style={{ opacity: wordOpacity }}>
                  {word}{" "}
                </span>
              );
            })}
          </p>

          {/* Attribution */}
          <p
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: attrFontSize,
              fontWeight: 600,
              color: BRAND.accent,
              textAlign: "center",
              margin: 0,
              opacity: attrProgress,
              transform: `translateY(${attrTranslateY}px)`,
            }}
          >
            — {attribution}
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default TestimonialScene;
