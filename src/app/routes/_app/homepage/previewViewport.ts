import { useThree } from '@react-three/fiber/webgpu';
import { useLayoutEffect, useReducer } from 'react';
import type { RefObject } from 'react';
import { PerspectiveCamera } from 'three';

type Bounds = Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>;
export type PreviewViewport = {
  fullWidth: number;
  fullHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** The canvas draws only the window cut out of the homepage's larger framing box. */
export function previewViewport(frame: Bounds, clip: Bounds): PreviewViewport | null {
  if (Math.min(frame.width, frame.height, clip.width, clip.height) <= 0) {
    return null;
  }
  return {
    fullWidth: frame.width,
    fullHeight: frame.height,
    x: clip.left - frame.left,
    y: clip.top - frame.top,
    width: clip.width,
    height: clip.height,
  };
}

export function usePreviewViewport(frameRef: RefObject<HTMLElement | null>, clipRef: RefObject<HTMLElement | null>) {
  const [viewport, measure] = useReducer(
    (previous: PreviewViewport | null, next: PreviewViewport | null) =>
      previous &&
      next &&
      Object.keys(next).every((key) => previous[key as keyof PreviewViewport] === next[key as keyof PreviewViewport])
        ? previous
        : next,
    null
  );
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const clip = clipRef.current;
    if (!frame || !clip) {
      return;
    }
    const update = () => measure(previewViewport(frame.getBoundingClientRect(), clip.getBoundingClientRect()));
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    observer.observe(clip);
    return () => observer.disconnect();
  }, [clipRef, frameRef]);
  return viewport;
}

export function applyPreviewViewport(camera: PerspectiveCamera, viewport: PreviewViewport) {
  camera.setViewOffset(
    viewport.fullWidth,
    viewport.fullHeight,
    viewport.x,
    viewport.y,
    viewport.width,
    viewport.height
  );
}

/* Fiber keeps the real canvas size for pointer rays and HTML overlays; only the camera sees the full frame. */
export function PreviewCameraCrop({ viewport }: { viewport: PreviewViewport }) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) {
      return;
    }
    applyPreviewViewport(camera, viewport);
    invalidate();
    return () => camera.clearViewOffset();
  }, [camera, invalidate, viewport]);
  return null;
}
