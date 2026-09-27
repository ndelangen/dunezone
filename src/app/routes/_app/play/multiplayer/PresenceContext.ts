import type { Vector3Tuple } from '@shared/play/model';
import type { PublicPointer } from '@shared/play/protocol';
import { createContext, useContext } from 'react';

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
export const PresenceContext = createContext<PresenceValue>(empty);
export function usePresence(): PresenceValue {
  return useContext(PresenceContext);
}
