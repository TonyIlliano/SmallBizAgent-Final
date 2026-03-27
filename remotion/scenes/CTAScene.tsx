import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Img,
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

interface CTASceneProps {
  ctaText: string;
  brandUrl: string;
  logoUrl?: string;
  startFrame: number;
  durationFrames: number;
  aspectRatio: AspectRatio;
}

const CTAScene: FC<CTASceneProps> = ({
  ctaText,
  brandUrl,
  logoUrl,
  startFrame,
  durationFrames,
  aspectRatio,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // frame is already relative inside <Sequence> — no offset needed
  const localFrame = frame;

  const isVertical = aspectRatio === "9:16";
  const padding = getContentPadding(aspectRatio);
  const ctaFontSize = getResponsiveFontSize(36, aspectRatio);
  const urlFontSize = getResponsiveFontSize(22, aspectRatio);

  // CTA text slides up with spring
  const ctaSpring = spring({
    frame: localFrame,
    fps,
    config: SPRING_CONFIGS.smooth,
    durationInFrames: 30,
  });
  const ctaTranslateY = interpolate(ctaSpring, [0, 1], [60, 0]);
  const ctaOpacity = ctaSpring;

  // Brand URL pill scale
  const pillDelay = 15;
  const pillSpring = spring({
    frame: localFrame - pillDelay,
    fps,
    config: SPRING_CONFIGS.snappy,
    durationInFrames: 25,
  });
  const pillScale = interpolate(pillSpring, [0, 1], [0, 1]);

  // Pill glow pulse after appearing
  const pillGlowPhase = localFrame - pillDelay - 25;
  const pillGlowOpacity =
    pillGlowPhase > 0
      ? 0.2 + 0.15 * Math.sin((pillGlowPhase / 40) * Math.PI * 2)
      : 0;

  // Logo — smaller embedded version
  const logoDelay = 8;
  const logoSpring = spring({
    frame: localFrame - logoDelay,
    fps,
    config: SPRING_CONFIGS.smooth,
    durationInFrames: 30,
  });
  const logoScale = interpolate(logoSpring, [0, 1], [0, 1]);

  // Breathing on logo
  const breathFrame = localFrame - logoDelay - 30;
  const breathScale =
    breathFrame > 0
      ? 1.0 + 0.02 * Math.sin((breathFrame / 60) * Math.PI * 2)
      : 1.0;

  return (
    <AbsoluteFill>
      {/* Brighter gradient background */}
      <AbsoluteFill
        style={gradientBg(BRAND.primaryLight, BRAND.primary, 135)}
      />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: isVertical ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          padding,
          gap: isVertical ? 32 : 48,
        }}
      >
        {/* Logo area — above for vertical, left for landscape */}
        <div
          style={{
            transform: `scale(${logoScale * breathScale})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            order: isVertical ? 0 : 0,
          }}
        >
          {logoUrl ? (
            <Img
              src={logoUrl}
              style={{
                width: isVertical ? 80 : 72,
                height: isVertical ? 80 : 72,
                objectFit: "contain",
              }}
            />
          ) : (
            <div
              style={{
                width: isVertical ? 72 : 64,
                height: isVertical ? 72 : 64,
                borderRadius: 18,
                background: `linear-gradient(135deg, ${BRAND.accent}, ${BRAND.accentLight})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 4px 20px ${BRAND.accent}44`,
              }}
            >
              <span
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize: 32,
                  fontWeight: 800,
                  color: BRAND.white,
                }}
              >
                S
              </span>
            </div>
          )}
        </div>

        {/* CTA text + URL pill */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
            order: 1,
          }}
        >
          {/* CTA text */}
          <h2
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: ctaFontSize,
              fontWeight: 700,
              color: BRAND.textPrimary,
              textAlign: "center",
              margin: 0,
              opacity: ctaOpacity,
              transform: `translateY(${ctaTranslateY}px)`,
              lineHeight: 1.3,
              maxWidth: isVertical ? "100%" : 500,
            }}
          >
            {ctaText}
          </h2>

          {/* Brand URL pill */}
          <div
            style={{
              backgroundColor: `${BRAND.accent}18`,
              border: `2px solid ${BRAND.accent}`,
              borderRadius: 40,
              padding: "12px 32px",
              transform: `scale(${pillScale})`,
              boxShadow: `0 0 20px rgba(20, 184, 166, ${pillGlowOpacity})`,
            }}
          >
            <span
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: urlFontSize,
                fontWeight: 700,
                color: BRAND.accent,
                letterSpacing: 0.5,
              }}
            >
              {brandUrl}
            </span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default CTAScene;
