import { SandArtData, SandParticle } from "./sandData";

// Grid size constants
const CELL_SIZE = 4;

function createGrid(width: number, height: number, particles: SandParticle[]) {
  const cols = Math.floor(width / CELL_SIZE);
  const rows = Math.floor(height / CELL_SIZE);
  const grid: (SandParticle | null)[][] = Array.from({ length: cols }, () =>
    Array(rows).fill(null)
  );
  particles.forEach(p => {
    const x = Math.floor(p.x / CELL_SIZE);
    const y = Math.floor(p.y / CELL_SIZE);
    grid[x][y] = p;
  });
  return { grid, cols, rows };
}

export function simulateSandStep(
  sandData: SandArtData,
  tiltX: number = 0,
  tiltY: number = 1 // default to gravity
): SandArtData {
  const { particles, width, height } = sandData;
  const { grid, cols, rows } = createGrid(width, height, particles);

  // Move from bottom up so lower particles settle first
  for (let y = rows - 2; y >= 0; y--) {
    for (let x = 0; x < cols; x++) {
      const p = grid[x][y];
      if (!p) continue;

      // Possible moves: straight down, diagonal left/right, or biased by tilt
      const moves = [
        { dx: Math.sign(tiltX), dy: 1 }, // tilted direction
        { dx: 0, dy: 1 }, // down
        { dx: -1, dy: 1 }, // down-left
        { dx: 1, dy: 1 }, // down-right
      ];

      for (const move of moves) {
        const nx = Math.min(cols - 1, Math.max(0, x + move.dx));
        const ny = Math.min(rows - 1, Math.max(0, y + move.dy));
        if (!grid[nx][ny]) {
          // Move particle
          grid[nx][ny] = { ...p, x: nx * CELL_SIZE, y: ny * CELL_SIZE };
          grid[x][y] = null;
          break;
        }
      }
    }
  }
  // Collect new particles
  let newParticles: SandParticle[] = [];
  for (let x = 0; x < cols; x++)
    for (let y = 0; y < rows; y++)
      if (grid[x][y]) newParticles.push(grid[x][y]);
  return { particles: newParticles, width, height };
}