import type { BufferGeometry, Material } from 'three';
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
} from 'three';

/*
 * The table shares its repeated shapes and plain materials: a late-game table drew some 400 meshes, each with a geometry and a
 * material of its own, so every layer of every stack uploaded its own buffers and kept its own GPU state.
 * A shape or a material here is built once for the page and handed to every mesh that asks for the same one. The set is
 * small (a handful of shapes, one material per colour in play), so nothing is released; Fiber disposes only what it
 * created, never a geometry or material passed in as a property. Textured materials stay with their meshes, because
 * their published images come and go.
 */
const geometries = new Map<string, BufferGeometry>();
const materials = new Map<string, Material>();
const textures = new Map<string, CanvasTexture>();

function cached<T>(cache: Map<string, unknown>, key: string, create: () => T): T {
  let value = cache.get(key) as T | undefined;
  if (value === undefined) {
    value = create();
    cache.set(key, value);
  }
  return value;
}

export const sharedGeometry = {
  box: (width: number, height: number, depth: number) =>
    cached(geometries, `box:${width}:${height}:${depth}`, () => new BoxGeometry(width, height, depth)),
  plane: (width = 1, height = 1) =>
    cached(geometries, `plane:${width}:${height}`, () => new PlaneGeometry(width, height)),
  circle: (radius: number, segments: number) =>
    cached(geometries, `circle:${radius}:${segments}`, () => new CircleGeometry(radius, segments)),
  ring: (inner: number, outer: number, segments: number) =>
    cached(geometries, `ring:${inner}:${outer}:${segments}`, () => new RingGeometry(inner, outer, segments)),
  cylinder: (top: number, bottom: number, height: number, segments: number) =>
    cached(
      geometries,
      `cylinder:${top}:${bottom}:${height}:${segments}`,
      () => new CylinderGeometry(top, bottom, height, segments)
    ),
  cone: (radius: number, height: number, segments: number) =>
    cached(geometries, `cone:${radius}:${height}:${segments}`, () => new ConeGeometry(radius, height, segments)),
};

type StandardParameters = { color: string; roughness: number; metalness: number; transparent?: boolean };

export function sharedStandardMaterial({ color, roughness, metalness, transparent = false }: StandardParameters) {
  return cached(
    materials,
    `standard:${color}:${roughness}:${metalness}:${transparent}`,
    () => new MeshStandardMaterial({ color, roughness, metalness, transparent })
  );
}

type BasicParameters = { color: string; opacity?: number; transparent?: boolean; depthWrite?: boolean };

export function sharedBasicMaterial({ color, opacity = 1, transparent = false, depthWrite = true }: BasicParameters) {
  return cached(
    materials,
    `basic:${color}:${opacity}:${transparent}:${depthWrite}`,
    () => new MeshBasicMaterial({ color, opacity, transparent, depthWrite })
  );
}

/*
 * The soft disc under a piece, painted as drei's `Shadow` paints it: a radial fade from `color` at `colorStop` to clear
 * at the edge on a 128-pixel canvas, drawn on both sides, unfogged and without depth writes.
 * drei paints a canvas and uploads a texture for every piece; here every piece shares one, and one material per opacity.
 */
function contactShadowTexture(color: string, colorStop: number) {
  return cached(textures, `shadow:${color}:${colorStop}`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(colorStop, new Color(color).getStyle());
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    /* Fiber does not mark drei's texture as sRGB, so neither is this one: the shadow stays exactly as dark as before. */
    return new CanvasTexture(canvas);
  });
}

export function contactShadowMaterial(color: string, colorStop: number, opacity: number) {
  return cached(
    materials,
    `shadow:${color}:${colorStop}:${opacity}`,
    () =>
      new MeshBasicMaterial({
        map: contactShadowTexture(color, colorStop),
        transparent: true,
        opacity,
        fog: false,
        depthWrite: false,
        side: DoubleSide,
      })
  );
}
