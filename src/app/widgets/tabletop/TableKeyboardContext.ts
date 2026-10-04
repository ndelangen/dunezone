import { createContext, useContext } from 'react';

import type { TableKeyboard } from './TableKeyboard';

export const TableKeyboardContext = createContext<TableKeyboard | null>(null);

export function useTableKeyboard() {
  const keyboard = useContext(TableKeyboardContext);
  if (!keyboard) {
    throw new Error('Keyboard input needs a table.');
  }
  return keyboard;
}
