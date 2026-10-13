import type { BufferGeometry } from 'three';
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  PlaneGeometry,
  RingGeometry,
} from 'three';

/*
 * The table shares its repeated shapes: a late-game table drew some 400 meshes, each with a geometry of its own, so
 * every layer of every stack uploaded its own vertex buffers. A shape here is built once for the page and handed to
 * every mesh that asks for the same one. The set is small (a handful of shapes), so nothing is released; Fiber disposes
 * only what it created, never a geometry passed in as a property.
 * Materials stay with their meshes on purpose: the renderer frees a mesh's draw state only when its material is
 * disposed, so a material shared past its meshes' unmount would keep every removed mesh's state alive.
 */
const geometries = new Map<string, BufferGeometry>();
const textures = new Map<string, CanvasTexture>();

function cached<T>(cache: Map<string, T>, key: string, create: () => T): T {
  let value = cache.get(key);
  if (value === undefined) {
    value = create();
    cache.set(key, value);
  }
  return value;
}

function shape<T extends BufferGeometry>(key: string, create: () => T): T {
  return cached(geometries, key, create) as T;
}

export const sharedGeometry = {
  box: (width: number, height: number, depth: number) =>
    shape(`box:${width}:${height}:${depth}`, () => new BoxGeometry(width, height, depth)),
  plane: (width = 1, height = 1) => shape(`plane:${width}:${height}`, () => new PlaneGeometry(width, height)),
  circle: (radius: number, segments: number) =>
    shape(`circle:${radius}:${segments}`, () => new CircleGeometry(radius, segments)),
  ring: (inner: number, outer: number, segments: number) =>
    shape(`ring:${inner}:${outer}:${segments}`, () => new RingGeometry(inner, outer, segments)),
  cylinder: (top: number, bottom: number, height: number, segments: number) =>
    shape(`cylinder:${top}:${bottom}:${height}:${segments}`, () => new CylinderGeometry(top, bottom, height, segments)),
  cone: (radius: number, height: number, segments: number) =>
    shape(`cone:${radius}:${height}:${segments}`, () => new ConeGeometry(radius, height, segments)),
};

/*
 * The soft disc under a piece, painted as drei's `Shadow` paints it: a radial fade from `color` at `colorStop` to clear
 * at the edge on a 128-pixel canvas. drei paints a canvas and uploads a texture for every piece; every piece shares this one.
 */
export function contactShadowTexture(color: string, colorStop: number) {
  return cached(textures, `${color}:${colorStop}`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(colorStop, new Color(color).getStyle());
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return new CanvasTexture(canvas);
  });
}
