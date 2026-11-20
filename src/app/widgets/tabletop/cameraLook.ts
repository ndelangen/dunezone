import type { Vector3Tuple } from '@shared/play/model';
import { createContext } from 'react';

/** Asks the table's camera to take a close look at a spot on the table, such as where a ping landed. */
export type CameraLook = Readonly<{
  lookAt: (spot: Vector3Tuple) => void;
  subscribe: (listener: (spot: Vector3Tuple) => void) => () => void;
}>;

/** A camera look for one table: the page asks, and the table's camera answers. */
export function createCameraLook(): CameraLook {
  const listeners = new Set<(spot: Vector3Tuple) => void>();
  return {
    lookAt: (spot) => listeners.forEach((listener) => listener(spot)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The camera look a table answers; none where nothing outside the scene steers its camera. */
export const CameraLookContext = createContext<CameraLook | null>(null);
