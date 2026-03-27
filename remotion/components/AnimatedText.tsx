import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { SPRING_CONFIGS, wordReveal, typewriterText } from "../utils/animations";
import { FONT_FAMILY } from "../utils/fonts";
import { BRAND } from "../utils/colors";

interface AnimatedTextProps {
  text: string;
  startFrame: number;
  mode?: "words" | "typewriter" | "spring" | "fade";
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  textAlign?: "left" | "center" | "right";
  framesPerWord?: number;
  style?: React.CSSProperties;
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  startFrame,
  mode = "words",
  fontSize = 48,
  color = BRAND.white,
  fontWeight = 700,
  textAlign = "center",
  framesPerWord = 3,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let displayText = text;
  let opacity = 1;
  let transform = "none";

  switch (mode) {
    case "words":
      displayText = wordReveal(text, frame, startFrame, framesPerWord);
      opacity = frame >= startFrame ? 1 : 0;
      break;
    case "typewriter":
      displayText = typewriterText(text, frame, startFrame, 1);
      opacity = frame >= startFrame ? 1 : 0;
      break;
    case "spring": {
      const progress = spring({
        frame: frame - startFrame,
        fps,
        config: SPRING_CONFIGS.smooth,
      });
      opacity = progress;
      transform = `scale(${interpolate(progress, [0, 1], [0.8, 1])})`;
      break;
    }
    case "fade":
      opacity = interpolate(frame, [startFrame, startFrame + 20], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      break;
  }

  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontSize,
        color,
        fontWeight,
        textAlign,
        opacity,
        transform,
        lineHeight: 1.2,
        letterSpacing: "-0.02em",
        ...style,
      }}
    >
      {displayText}
    </div>
  );
};
