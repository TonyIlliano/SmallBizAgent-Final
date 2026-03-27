import React from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { z } from "zod";
import { BRAND } from "../utils/colors";
import { FONT_FAMILY } from "../utils/fonts";
import type { AspectRatio } from "../utils/aspect-ratio";

const screenSequenceItemSchema = z.object({
  description: z.string(),
  durationSec: z.number(),
  clipUrl: z.string().nullable().optional(),
});

const brollClipSchema = z.object({
  url: z.string(),
  durationSec: z.number(),
  startFrame: z.number().optional(),
});

const statsSchema = z.object({
  totalBusinesses: z.number().optional(),
  totalCalls: z.number().optional(),
  totalAppointments: z.number().optional(),
  totalRevenue: z.number().optional(),
}).nullable();

export const adVideoSchema = z.object({
  hook: z.string(),
  voiceoverUrl: z.string().nullable(),
  backgroundMusicUrl: z.string().nullable(),
  voiceoverDurationSec: z.number(),
  screenSequence: z.array(screenSequenceItemSchema),
  brollClips: z.array(brollClipSchema),
  ctaOverlay: z.string(),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
  totalDurationFrames: z.number(),
  brandUrl: z.string(),
  logoUrl: z.string().nullable(),
  stats: statsSchema,
});

export type AdVideoProps = z.infer<typeof adVideoSchema>;

export const AdVideo: React.FC<AdVideoProps> = ({
  hook,
  voiceoverUrl,
  backgroundMusicUrl,
  voiceoverDurationSec,
  screenSequence,
  brollClips,
  ctaOverlay,
  aspectRatio,
  totalDurationFrames,
  brandUrl,
  logoUrl,
  stats,
}) => {
  return (
    <AbsoluteFill
      style={{
        background: BRAND.gradients.default,
        fontFamily: FONT_FAMILY,
      }}
    >
      {/* Hook scene */}
      <Sequence from={0} durationInFrames={90} name="Hook">
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 60,
          }}
        >
          <h1
            style={{
              color: BRAND.white,
              fontSize: 72,
              fontWeight: 800,
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            {hook}
          </h1>
        </AbsoluteFill>
      </Sequence>

      {/* Screen sequence scenes */}
      {screenSequence.map((scene, index) => {
        const startFrame = 90 + index * 90;
        return (
          <Sequence
            key={index}
            from={startFrame}
            durationInFrames={Math.round(scene.durationSec * 30)}
            name={`Scene-${index}`}
          >
            <AbsoluteFill
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 60,
              }}
            >
              <p
                style={{
                  color: BRAND.textSecondary,
                  fontSize: 48,
                  textAlign: "center",
                }}
              >
                {scene.description}
              </p>
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* CTA scene */}
      <Sequence
        from={totalDurationFrames - 120}
        durationInFrames={120}
        name="CTA"
      >
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 60,
            background: BRAND.gradients.cta,
          }}
        >
          <h2
            style={{
              color: BRAND.white,
              fontSize: 64,
              fontWeight: 700,
              textAlign: "center",
              marginBottom: 40,
            }}
          >
            {ctaOverlay}
          </h2>
          <p
            style={{
              color: BRAND.white,
              fontSize: 36,
              opacity: 0.9,
            }}
          >
            {brandUrl}
          </p>
        </AbsoluteFill>
      </Sequence>

      {/* Brand watermark */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          padding: 30,
          pointerEvents: "none",
        }}
      >
        <p
          style={{
            color: BRAND.white,
            fontSize: 20,
            opacity: 0.4,
          }}
        >
          {brandUrl}
        </p>
      </AbsoluteFill>

      {/* Audio layers */}
      {voiceoverUrl && (
        <Audio src={voiceoverUrl} volume={1} />
      )}
      {backgroundMusicUrl && (
        <Audio src={backgroundMusicUrl} volume={0.15} />
      )}
    </AbsoluteFill>
  );
};
