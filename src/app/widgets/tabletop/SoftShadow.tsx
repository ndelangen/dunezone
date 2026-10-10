/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { CanvasTexture } from 'three';

/*
 * A soft shadow painted flat under something round: dark under its `radius` and fading out over `spread` past its edge.
 * The table casts no shadow maps, so a painted disc is all a shadow costs.
 */
/* Kept for the page's lifetime: one small texture per fade shape, and the table uses only a handful. */
const shadowTextures = new Map<string, CanvasTexture>();
function shadowTexture(solid: number, size: number) {
  const key = `${Math.round(solid * 10_000)}:${size}`;
  const cached = shadowTextures.get(key);
  if (cached) {
    return cached;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(solid, 'rgba(0, 0, 0, 0.85)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  shadowTextures.set(key, texture);
  return texture;
}

function ignoreRaycast() {
  // A shadow is never an interaction target.
}

export function SoftShadow({
  radius,
  spread,
  y,
  opacity,
  size = 256,
}: {
  radius: number;
  spread: number;
  y: number;
  opacity: number;
  /* Texture size: a wide shadow with a narrow fade needs more pixels for the fade to stay smooth. */
  size?: number;
}) {
  const outer = radius + spread;
  return (
    <mesh raycast={ignoreRaycast} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <circleGeometry args={[outer, 128]} />
      <meshBasicMaterial
        map={shadowTexture(radius / outer, size)}
        transparent
        opacity={opacity}
        depthWrite={false}
        color="#000000"
      />
    </mesh>
  );
}
