import { createContext, useContext } from 'react';

import type { PointerSession } from './PointerSession';

export const PointerSessionContext = createContext<PointerSession | null>(null);

export function usePointerSession() {
  const session = useContext(PointerSessionContext);
  if (!session) {
    throw new Error('Pointer interactions need a table.');
  }
  return session;
}
