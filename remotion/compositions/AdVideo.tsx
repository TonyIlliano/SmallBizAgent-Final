import React from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { z } from "zod";
import { BRAND } from "../utils/colors";
import { FONT_FAMILY } from "../utils/fonts";

import HookScene from "../scenes/HookScene";
import DemoClipScene from "../scenes/DemoClipScene";
import FeatureHighlightScene from "../scenes/FeatureHighlightScene";
import CTAScene from "../scenes/CTAScene";
import { BrandBar } from "../components/BrandBar";

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

const FPS = 30;

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
  const hookDurationFrames = 3 * FPS; // 3 seconds
  const ctaDurationFrames = 4 * FPS;  // 4 seconds
  const ctaStartFrame = totalDurationFrames - ctaDurationFrames;

  // Calculate scene start frames from durations
  let currentFrame = hookDurationFrames;
  const sceneTimings = screenSequence.map((scene) => {
    const start = currentFrame;
    const dur = Math.round(scene.durationSec * FPS);
    currentFrame += dur;
    return { startFrame: start, durationFrames: dur };
  });

  // BrandBar visible during content scenes (after hook, before CTA)
  const brandBarStart = hookDurationFrames;
  const brandBarEnd = ctaStartFrame;

  // Coerce aspectRatio for scene components that only accept "9:16"|"16:9"
  const sceneAspect: "9:16" | "16:9" =
    aspectRatio === "16:9" ? "16:9" : "9:16";

  return (
    <AbsoluteFill
      style={{
        background: BRAND.gradients.default,
        fontFamily: FONT_FAMILY,
      }}
    >
      {/* Hook scene — animated word-by-word reveal */}
      <Sequence from={0} durationInFrames={hookDurationFrames} name="Hook">
        <HookScene
          text={hook}
          startFrame={0}
          durationFrames={hookDurationFrames}
          aspectRatio={sceneAspect}
        />
      </Sequence>

      {/* Screen sequence scenes */}
      {screenSequence.map((scene, index) => {
        const timing = sceneTimings[index];
        if (!timing || timing.durationFrames <= 0) return null;

        return (
          <Sequence
            key={index}
            from={timing.startFrame}
            durationInFrames={timing.durationFrames}
            name={`Scene-${index}`}
          >
            {scene.clipUrl ? (
              /* Scene has a matched clip — show with Ken Burns effect */
              <DemoClipScene
                clipUrl={scene.clipUrl}
                startFrame={timing.startFrame}
                durationFrames={timing.durationFrames}
                label={scene.description}
                aspectRatio={sceneAspect}
              />
            ) : (
              /* No clip — show description as a feature highlight */
              <FeatureHighlightScene
                features={[scene.description]}
                startFrame={timing.startFrame}
                durationFrames={timing.durationFrames}
                aspectRatio={sceneAspect}
              />
            )}
          </Sequence>
        );
      })}

      {/* CTA scene — logo + call-to-action + brand URL */}
      <Sequence
        from={ctaStartFrame}
        durationInFrames={ctaDurationFrames}
        name="CTA"
      >
        <CTAScene
          ctaText={ctaOverlay}
          brandUrl={brandUrl}
          logoUrl={logoUrl ?? undefined}
          startFrame={ctaStartFrame}
          durationFrames={ctaDurationFrames}
          aspectRatio={sceneAspect}
        />
      </Sequence>

      {/* BrandBar — small logo + URL bar during content scenes */}
      {brandBarEnd > brandBarStart && (
        <BrandBar
          logoUrl={logoUrl ?? undefined}
          brandUrl={brandUrl}
          startFrame={brandBarStart}
          endFrame={brandBarEnd}
          position="bottom"
          aspectRatio={sceneAspect}
        />
      )}

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
