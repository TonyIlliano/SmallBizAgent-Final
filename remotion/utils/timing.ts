export interface SceneTiming {
  startFrame: number;
  durationFrames: number;
}

export interface TimingConfig {
  fps: number;
  hookDurationSec: number;
  ctaDurationSec: number;
  minSceneDurationSec: number;
}

const DEFAULT_CONFIG: TimingConfig = {
  fps: 30,
  hookDurationSec: 3,
  ctaDurationSec: 4,
  minSceneDurationSec: 3,
};

export function calculateSceneTimings(
  voiceoverDurationSec: number | null,
  screenSequence: Array<{ durationSec: number }>,
  estimatedDuration: number | null,
  config?: Partial<TimingConfig>
): {
  totalDurationFrames: number;
  hookTiming: SceneTiming;
  scenesTimings: SceneTiming[];
  ctaTiming: SceneTiming;
} {
  const cfg: TimingConfig = { ...DEFAULT_CONFIG, ...config };
  const { fps, hookDurationSec, ctaDurationSec, minSceneDurationSec } = cfg;

  // Determine total duration in seconds
  let totalSec: number;

  if (voiceoverDurationSec && voiceoverDurationSec > 0) {
    // Voiceover duration + 2 seconds padding
    totalSec = voiceoverDurationSec + 2;
  } else if (estimatedDuration && estimatedDuration > 0) {
    totalSec = estimatedDuration;
  } else if (screenSequence.length > 0) {
    totalSec =
      hookDurationSec +
      screenSequence.reduce((sum, s) => sum + s.durationSec, 0) +
      ctaDurationSec;
  } else {
    totalSec = 30; // Default 30 seconds
  }

  // Clamp between 15 and 60 seconds
  totalSec = Math.max(15, Math.min(60, totalSec));

  const totalDurationFrames = Math.round(totalSec * fps);
  const hookDurationFrames = Math.round(hookDurationSec * fps);
  const ctaDurationFrames = Math.round(ctaDurationSec * fps);

  // Hook timing: first N seconds
  const hookTiming: SceneTiming = {
    startFrame: 0,
    durationFrames: hookDurationFrames,
  };

  // CTA timing: last N seconds
  const ctaStartFrame = totalDurationFrames - ctaDurationFrames;
  const ctaTiming: SceneTiming = {
    startFrame: ctaStartFrame,
    durationFrames: ctaDurationFrames,
  };

  // Remaining frames for screen sequence scenes
  const remainingFrames = totalDurationFrames - hookDurationFrames - ctaDurationFrames;
  const scenesTimings: SceneTiming[] = [];

  if (screenSequence.length > 0 && remainingFrames > 0) {
    const totalSequenceDuration = screenSequence.reduce(
      (sum, s) => sum + s.durationSec,
      0
    );

    let currentFrame = hookDurationFrames;

    for (let i = 0; i < screenSequence.length; i++) {
      const scene = screenSequence[i];
      const proportion =
        totalSequenceDuration > 0
          ? scene.durationSec / totalSequenceDuration
          : 1 / screenSequence.length;

      let sceneDurationFrames: number;

      if (i === screenSequence.length - 1) {
        // Last scene gets remaining frames to avoid rounding gaps
        sceneDurationFrames = ctaStartFrame - currentFrame;
      } else {
        sceneDurationFrames = Math.round(remainingFrames * proportion);
      }

      // Enforce minimum scene duration
      const minFrames = Math.round(minSceneDurationSec * fps);
      sceneDurationFrames = Math.max(minFrames, sceneDurationFrames);

      // Don't exceed CTA start
      if (currentFrame + sceneDurationFrames > ctaStartFrame) {
        sceneDurationFrames = ctaStartFrame - currentFrame;
      }

      if (sceneDurationFrames > 0) {
        scenesTimings.push({
          startFrame: currentFrame,
          durationFrames: sceneDurationFrames,
        });
      }

      currentFrame += sceneDurationFrames;

      // Stop if we've reached the CTA
      if (currentFrame >= ctaStartFrame) {
        break;
      }
    }
  }

  return {
    totalDurationFrames,
    hookTiming,
    scenesTimings,
    ctaTiming,
  };
}
