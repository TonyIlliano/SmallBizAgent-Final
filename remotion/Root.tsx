import React from "react";
import { Composition } from "remotion";
import { AdVideo, adVideoSchema } from "./compositions/AdVideo";
import { getDimensions } from "./utils/aspect-ratio";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AdVideo"
        component={AdVideo}
        schema={adVideoSchema}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          hook: "Your phone is costing you money.",
          voiceoverUrl: null,
          backgroundMusicUrl: null,
          voiceoverDurationSec: 0,
          screenSequence: [],
          brollClips: [],
          ctaOverlay: "Get started today",
          aspectRatio: "9:16" as const,
          totalDurationFrames: 900,
          brandUrl: "smallbizagent.ai",
          logoUrl: null,
          stats: null,
        }}
        calculateMetadata={async ({ props }) => {
          const dims = getDimensions(props.aspectRatio);
          return {
            durationInFrames: props.totalDurationFrames || 900,
            width: dims.width,
            height: dims.height,
            fps: 30,
          };
        }}
      />
    </>
  );
};
