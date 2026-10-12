/* This branch-only context lets the real table consume the spike without a production board contract. */
import { createContext } from 'react';
import type { BufferGeometry, Texture } from 'three';
export const BoardGeometryPrototypeContext = createContext<{
  geometry: BufferGeometry;
  texture?: Texture;
  textureReady?: Promise<void>;
  onHover(x: number, z: number, triangle: number | null): void;
} | null>(null);
