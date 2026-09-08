import { createContext, useContext } from 'react';

import type { Vector3Tuple } from '../model';
import type { PublicPointer } from './protocol';

export type PresenceValue = {
  pointers: PublicPointer[];
  remoteCarriedIds: ReadonlySet<string>;
  reservedPieceIds: ReadonlySet<string>;
  canInteract: boolean;
  publishPointer(position: Vector3Tuple | null): void;
};
const empty: PresenceValue = {
  pointers: [],
  remoteCarriedIds: new Set(),
  reservedPieceIds: new Set(),
  canInteract: true,
  publishPointer() {},
};
const PresenceContext = createContext<PresenceValue>(empty);
export function usePresence(): PresenceValue {
  return useContext(PresenceContext);
}
