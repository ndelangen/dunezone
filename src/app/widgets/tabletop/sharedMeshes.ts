import { useThree } from '@react-three/fiber/webgpu';
import type { BufferGeometry, Texture } from 'three';
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
 * every layer of every stack uploaded its own vertex buffers. A shape here is built once per table canvas and handed to
 * every mesh on it that asks for the same one; Fiber disposes only what it created, never a geometry passed in as a
 * property, so the canvas releases its set when it goes (see `releaseSharedMeshes`). The renderer's own bookkeeping
 * holds on to a shape's first mesh and to the renderer itself until that shape or texture is disposed, so nothing here
 * may outlive its canvas.
 * Materials stay with their meshes on purpose: the renderer frees a mesh's draw state only when its material is
 * disposed, so a material shared past its meshes' unmount would keep every removed mesh's state alive.
 */
type Resource = BufferGeometry | Texture;

function sharedMeshes() {
  const resources = new Map<string, Resource>();
  const cached = <T extends Resource>(key: string, create: () => T): T => {
    let value = resources.get(key) as T | undefined;
    if (value === undefined) {
      value = create();
      resources.set(key, value);
    }
    return value;
  };
  return {
    box: (width: number, height: number, depth: number) =>
      cached(`box:${width}:${height}:${depth}`, () => new BoxGeometry(width, height, depth)),
    plane: (width = 1, height = 1) => cached(`plane:${width}:${height}`, () => new PlaneGeometry(width, height)),
    circle: (radius: number, segments: number) =>
      cached(`circle:${radius}:${segments}`, () => new CircleGeometry(radius, segments)),
    ring: (inner: number, outer: number, segments: number) =>
      cached(`ring:${inner}:${outer}:${segments}`, () => new RingGeometry(inner, outer, segments)),
    cylinder: (top: number, bottom: number, height: number, segments: number) =>
      cached(
        `cylinder:${top}:${bottom}:${height}:${segments}`,
        () => new CylinderGeometry(top, bottom, height, segments)
      ),
    cone: (radius: number, height: number, segments: number) =>
      cached(`cone:${radius}:${height}:${segments}`, () => new ConeGeometry(radius, height, segments)),
    /*
     * The soft disc under a piece, painted as drei's `Shadow` paints it: a radial fade from `color` at `colorStop` to
     * clear at the edge on a 128-pixel canvas. drei paints and uploads one for every piece; the table shares this one.
     */
    contactShadow: (color: string, colorStop: number) =>
      cached(`shadow:${color}:${colorStop}`, () => {
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
      }),
    dispose: () => {
      for (const resource of resources.values()) {
        resource.dispose();
      }
      resources.clear();
    },
  };
}

export type SharedMeshes = Omit<ReturnType<typeof sharedMeshes>, 'dispose'>;

const byRenderer = new WeakMap<object, ReturnType<typeof sharedMeshes>>();

function meshesFor(renderer: object) {
  let meshes = byRenderer.get(renderer);
  if (!meshes) {
    meshes = sharedMeshes();
    byRenderer.set(renderer, meshes);
  }
  return meshes;
}

/** The shapes and shadow texture shared by every mesh on this table canvas. */
export function useSharedMeshes(): SharedMeshes {
  return meshesFor(useThree((state) => state.renderer));
}

/** Disposes a canvas's shared shapes and texture once the canvas has left the page, before its renderer goes. */
export function releaseSharedMeshes(renderer: object) {
  byRenderer.get(renderer)?.dispose();
  byRenderer.delete(renderer);
}
