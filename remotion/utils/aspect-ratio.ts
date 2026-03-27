export type AspectRatio = "9:16" | "16:9" | "1:1";

export interface Dimensions {
  width: number;
  height: number;
}

export function getDimensions(aspect: AspectRatio): Dimensions {
  switch (aspect) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "16:9":
      return { width: 1920, height: 1080 };
    case "1:1":
      return { width: 1080, height: 1080 };
    default:
      return { width: 1080, height: 1920 };
  }
}

export function isVertical(aspect: AspectRatio): boolean {
  return aspect === "9:16";
}

export function isSquare(aspect: AspectRatio): boolean {
  return aspect === "1:1";
}

export function getResponsiveFontSize(
  base: number,
  aspect: AspectRatio
): number {
  switch (aspect) {
    case "9:16":
      return base;
    case "16:9":
      return Math.round(base * 0.85);
    case "1:1":
      return Math.round(base * 0.9);
    default:
      return base;
  }
}

export function getContentPadding(aspect: AspectRatio): number {
  switch (aspect) {
    case "9:16":
      return 60;
    case "16:9":
      return 80;
    case "1:1":
      return 60;
    default:
      return 60;
  }
}
