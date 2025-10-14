import { SandArtData } from "./sandData";

/**
 * Animates rake along contours.
 * For each contour, moves rake and updates sand.
 */
export function startAutomatedDrawing(
  sandArtData: SandArtData,
  contours: { x: number, y: number }[][],
  onFrame: (sand: SandArtData, rakePos: { x: number, y: number }) => void
) {
  let contourIdx = 0, pointIdx = 0;
  let frame = 0;

  const interval = setInterval(() => {
    if (contourIdx >= contours.length) {
      clearInterval(interval);
      return;
    }
    const contour = contours[contourIdx];
    if (pointIdx >= contour.length) {
      pointIdx = 0;
      contourIdx++;
      return;
    }
    const rakePos = contour[pointIdx];
    pointIdx++;

    // Update sand: e.g., clear a line under the rake
    const particles = sandArtData.particles.map(p =>
      (Math.abs(p.x - rakePos.x) < 8 && Math.abs(p.y - rakePos.y) < 8)
        ? { ...p, color: "#FFFBEA" } // simulate clear
        : p
    );
    onFrame({ ...sandArtData, particles }, rakePos);
    frame++;
  }, 30);

  return () => clearInterval(interval);
}