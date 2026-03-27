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

interface Notification {
  title: string;
  subtitle?: string;
}

interface PhoneNotificationSceneProps {
  notifications: Notification[];
  startFrame: number;
  durationFrames: number;
  aspectRatio: AspectRatio;
}

const PhoneNotificationScene: FC<PhoneNotificationSceneProps> = ({
  notifications,
  startFrame,
  durationFrames,
  aspectRatio,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // frame is already relative inside <Sequence> — no offset needed
  const localFrame = frame;

  const isVertical = aspectRatio === "9:16";

  // Phone slides up from below
  const phoneSpring = spring({
    frame: localFrame,
    fps,
    config: SPRING_CONFIGS.smooth,
    durationInFrames: 40,
  });
  const phoneTranslateY = interpolate(phoneSpring, [0, 1], [300, 0]);

  // Subtle float after settling
  const settleFrame = 40;
  const hasSettled = localFrame > settleFrame;
  const floatY = hasSettled
    ? 4 * Math.sin(((localFrame - settleFrame) / 180) * Math.PI * 2)
    : 0;

  // Phone dimensions
  const phoneWidth = isVertical ? 260 : 220;
  const phoneHeight = isVertical ? 520 : 440;
  const notchWidth = 100;
  const cornerRadius = 32;

  const notifStagger = 25;
  const titleFontSize = getResponsiveFontSize(14, aspectRatio);

  return (
    <AbsoluteFill>
      <AbsoluteFill style={gradientBg(BRAND.primary, BRAND.primaryLight, 140)} />

      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Phone frame */}
        <div
          style={{
            width: phoneWidth,
            height: phoneHeight,
            borderRadius: cornerRadius,
            border: `3px solid ${BRAND.accent}44`,
            backgroundColor: "#0a0f1a",
            position: "relative",
            overflow: "hidden",
            transform: `translateY(${phoneTranslateY + floatY}px)`,
            boxShadow: `0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px ${BRAND.accent}22`,
          }}
        >
          {/* Notch */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: notchWidth,
              height: 28,
              backgroundColor: "#000",
              borderRadius: "0 0 16px 16px",
              zIndex: 10,
            }}
          />

          {/* Screen content area */}
          <div
            style={{
              position: "absolute",
              top: 40,
              left: 12,
              right: 12,
              bottom: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              overflow: "hidden",
            }}
          >
            {/* Teal accent elements on screen */}
            <div
              style={{
                width: "60%",
                height: 3,
                backgroundColor: `${BRAND.accent}33`,
                borderRadius: 2,
                marginBottom: 8,
              }}
            />

            {/* Notification cards */}
            {notifications.map((notif, i) => {
              const delay = 15 + i * notifStagger;

              const notifSpring = spring({
                frame: localFrame - delay,
                fps,
                config: SPRING_CONFIGS.bouncy,
                durationInFrames: 25,
              });
              const notifScale = interpolate(notifSpring, [0, 1], [0, 1]);

              // Teal glow pulse
              const glowPhase = localFrame - delay - 20;
              const glowOpacity =
                glowPhase > 0
                  ? 0.15 + 0.1 * Math.sin((glowPhase / 30) * Math.PI * 2)
                  : 0;

              return (
                <div
                  key={`notif-${i}`}
                  style={{
                    backgroundColor: BRAND.cardBg,
                    borderRadius: 12,
                    padding: "12px 14px",
                    transform: `scale(${notifScale})`,
                    boxShadow: `0 0 16px rgba(20, 184, 166, ${glowOpacity})`,
                    border: `1px solid ${BRAND.accent}22`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {/* Notification dot */}
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: BRAND.accent,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: FONT_FAMILY,
                        fontSize: titleFontSize,
                        fontWeight: 600,
                        color: BRAND.textPrimary,
                        lineHeight: 1.3,
                      }}
                    >
                      {notif.title}
                    </span>
                  </div>
                  {notif.subtitle && (
                    <span
                      style={{
                        fontFamily: FONT_FAMILY,
                        fontSize: titleFontSize - 2,
                        color: BRAND.textSecondary,
                        marginTop: 4,
                        marginLeft: 16,
                        display: "block",
                        lineHeight: 1.3,
                      }}
                    >
                      {notif.subtitle}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default PhoneNotificationScene;
