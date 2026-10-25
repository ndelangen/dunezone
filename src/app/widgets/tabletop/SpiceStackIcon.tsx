/* @jsxImportSource ./three-jsx */

import { gameAssetColors } from '@shared/play/assetColors';
import { SPICE_TOKEN_RADIUS } from '@shared/play/spice';
import { useSyncExternalStore } from 'react';
import type { ExtrudeGeometry } from 'three';

import { ignoreRaycast } from './ignoreRaycast';
import { loadPhaseSymbolGeometry } from './phaseSymbolGeometry';

const SPICE_ICON = '/vector/icon/spice.svg';
const SPICE_ICON_COLOR = gameAssetColors.spiceIcon;
const SPICE_FACE_RADIUS = SPICE_TOKEN_RADIUS * 0.79;

/* Every spice stack shares one icon solid, loaded once for the page and never disposed. */
let shared: ExtrudeGeometry | null = null;
let loading = false;
const listeners = new Set<() => void>();

/* A failed load leaves `loading` clear, so the next stack to mount asks again. */
function load() {
  if (shared || loading) {
    return;
  }
  loading = true;
  loadPhaseSymbolGeometry(SPICE_ICON, SPICE_FACE_RADIUS, (loaded) => {
    loading = false;
    shared = loaded;
    if (loaded) {
      for (const notify of listeners) {
        notify();
      }
    }
  });
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  load();
  return () => {
    listeners.delete(notify);
  };
}

function useSpiceIconGeometry(): ExtrudeGeometry | null {
  return useSyncExternalStore(
    subscribe,
    () => shared,
    () => null
  );
}

/** The site's spice icon, sitting on the top face of a spice stack layer. */
export function SpiceStackIcon({ y, renderOrder }: Readonly<{ y: number; renderOrder: number }>) {
  const geometry = useSpiceIconGeometry();
  return geometry ? (
    <mesh position={[0, y, 0]} raycast={ignoreRaycast} renderOrder={renderOrder}>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color={SPICE_ICON_COLOR} roughness={1} metalness={0} />
    </mesh>
  ) : null;
}
