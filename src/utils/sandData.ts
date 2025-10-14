// Defines a simple sand particle data structure
export type SandParticle = {
  x: number;
  y: number;
  color: string;
};

export type SandArtData = {
  particles: SandParticle[];
  width: number;
  height: number;
};