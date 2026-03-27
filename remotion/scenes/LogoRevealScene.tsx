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
  gradientBg,
} from "../utils";

interface LogoRevealSceneProps {
  logoUrl?: string;
  startFrame: number;
  durationFrames: number;
  showWordmark?: boolean;
}

const LogoRevealScene: FC<LogoRevealSceneProps> = ({
  logoUrl,
  startFrame,
  durationFrames,
  showWordmark = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;

  if (localFrame < 0 || localFrame >= durationFrames) {
    return null;
  }

  // Logo scales from 0 to 1
  const logoSpring = spring({
    frame: localFrame,
    fps,
    config: SPRING_CONFIGS.smooth,
    durationInFrames: 35,
  });
  const logoScale = interpolate(logoSpring, [0, 1], [0, 1]);

  // Breathing effect after settling
  const breathingStart = 35;
  const hasSettled = localFrame > breathingStart;
  const breathScale = hasSettled
    ? 1.0 +
      0.02 *
        Math.sin(((localFrame - breathingStart) / 60) * Math.PI * 2)
    : 1.0;
  const finalScale = logoScale * breathScale;

  // Radial glow expands behind logo
  const glowExpand = interpolate(localFrame, [5, 30], [0, 200], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowOpacity = interpolate(localFrame, [5, 20, 50, 70], [0, 0.3, 0.3, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Typewriter for wordmark
  const wordmark = "SmallBizAgent";
  const typeDelay = 25;
  const charsToShow = animations.typewriter(localFrame, typeDelay, wordmark.length, 2);

  return (
    <AbsoluteFill>
      <AbsoluteFill style={gradientBg(BRAND.primary, BRAND.primaryLight, 160)} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        {/* Radial glow behind logo */}
        <div
          style={{
            position: "absolute",
            width: glowExpand * 2,
            height: glowExpand * 2,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${BRAND.accent}66 0%, transparent 70%)`,
            opacity: glowOpacity,
            pointerEvents: "none",
          }}
        />

        {/* Logo image or fallback */}
        <div
          style={{
            transform: `scale(${finalScale})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {logoUrl ? (
            <Img
              src={logoUrl}
              style={{
                width: 120,
                height: 120,
                objectFit: "contain",
              }}
            />
          ) : (
            <div
              style={{
                width: 100,
                height: 100,
                borderRadius: 24,
                background: `linear-gradient(135deg, ${BRAND.accent}, ${BRAND.accentLight})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 4px 24px ${BRAND.accent}44`,
              }}
            >
              <span
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize: 44,
                  fontWeight: 800,
                  color: BRAND.white,
                }}
              >
                S
              </span>
            </div>
          )}
        </div>

        {/* Wordmark typewriter */}
        {showWordmark && (
          <div
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: 32,
              fontWeight: 700,
              color: BRAND.textPrimary,
              letterSpacing: 1,
              minHeight: 40,
            }}
          >
            {wordmark.slice(0, charsToShow)}
            {charsToShow < wordmark.length && (
              <span
                style={{
                  opacity: Math.sin(localFrame * 0.3) > 0 ? 1 : 0,
                  color: BRAND.accent,
                }}
              >
                |
              </span>
            )}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default LogoRevealScene;
