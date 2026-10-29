import { useCallback, useSyncExternalStore } from 'react';
import { SRGBColorSpace } from 'three';
import type { Texture } from 'three';

import { loadFaceTexture } from './cardFaceTexture';
import { sharedPublishedFaces } from './publishedFaceRetry';

/* Every piece and every stack layer that shows the same published image draws one shared texture, so the image is uploaded once rather than once per face. */
const subscribePublishedFace = sharedPublishedFaces<Texture>({
  load: loadFaceTexture,
  prepare: (value) => {
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 8;
  },
  release: (value) => value.dispose(),
});

/*
 * Holds one published image and returns it once loaded. The shared store is the only source of truth, read through
 * useSyncExternalStore, so a face never draws a texture released while it showed another image, and a retried load
 * that lands later always re-renders it.
 */
export function usePublishedFace(href: string | undefined): Texture | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => (href ? subscribePublishedFace(href, onChange) : () => {}),
    [href]
  );
  const snapshot = useCallback(() => (href ? subscribePublishedFace.peek(href) : undefined), [href]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
