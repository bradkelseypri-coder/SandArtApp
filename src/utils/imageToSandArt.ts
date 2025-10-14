import { SandArtData, SandParticle } from "./sandData";

/**
 * Converts a photo to sand clusters and contour points for rake tracing.
 * For real use, integrate with OpenCV or similar.
 */
export async function imageToSandArt(imageUri: string): Promise<{ 
  sand: SandArtData;
  contours: { x: number; y: number }[][];
}> {
  // TODO: Use image lib to downscale, quantize, and extract edges
  // Here, return a dummy sand cloud and random contour

  const width = 320, height = 480;
  let particles: SandParticle[] = [];
  for (let x = 0; x < width; x += 6) {
    for (let y = 0; y < height; y += 6) {
      particles.push({
        x: x + Math.random() * 3,
        y: y + Math.random() * 3,
        color: ["#F4E6CA", "#29B6F6", "#3E2723"][Math.floor(Math.random() * 3)],
      });
    }
  }
  // Dummy contour: a wavy line across the middle
  const contours = [
    Array.from({ length: width / 8 }, (_, i) => ({
      x: i * 8,
      y: height / 2 + Math.sin(i / 5) * 20,
    })),
  ];
  return { sand: { particles, width, height }, contours };
}