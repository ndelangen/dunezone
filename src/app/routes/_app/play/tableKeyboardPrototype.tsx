/*
 * PROTOTYPE, #1323 F29. Throwaway, on prototype/1323-1323-f29-table-keyboard, which never merges.
 * `?variant=a|b|c` on the game route picks who answers the number keys over the spice disc.
 * A is main as it is: the table hook and the disc's own capture-phase listener, which ignores a digit typed with Shift.
 * B is the ticket's change: one TableKeyboard owner, and over the hovered disc a typed digit spawns spice whatever Shift does, so AZERTY's 1 (Shift and the & key) spawns.
 * C is B reading the physical key (`event.code`): the top-row and keypad keys give their digit on any layout, with or without Shift, for the disc and the one-second draw alike.
 */
import { Box, SegmentedControl, Text } from '@mantine/core';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { createContext, useContext } from 'react';

import type { DigitSource } from './TableKeyboard';

const TABLE_KEYBOARD_VARIANTS = [
  { key: 'a', name: 'A: as main is now' },
  { key: 'b', name: 'B: one owner, typed digit, Shift allowed' },
  { key: 'c', name: 'C: one owner, physical key' },
] as const;

export type TableKeyboardVariant = (typeof TABLE_KEYBOARD_VARIANTS)[number]['key'];

export function isTableKeyboardVariant(value: unknown): value is TableKeyboardVariant {
  return TABLE_KEYBOARD_VARIANTS.some((variant) => variant.key === value);
}

/* Read where the router is; the scene reads it through the context below, which the canvas carries across. */
export function useTableKeyboardVariantSearch(): TableKeyboardVariant {
  const search: { variant?: unknown } = useSearch({ strict: false });
  return isTableKeyboardVariant(search.variant) ? search.variant : 'a';
}

export const TableKeyboardVariantContext = createContext<TableKeyboardVariant>('a');

export function useTableKeyboardVariant() {
  return useContext(TableKeyboardVariantContext);
}

export function digitSourceFor(variant: TableKeyboardVariant): DigitSource {
  return variant === 'c' ? 'code' : 'key';
}

/* The floating bar that flips `?variant=` in place. */
export function TableKeyboardVariantBar() {
  const current = useTableKeyboardVariantSearch();
  const navigate = useNavigate();
  if (import.meta.env.PROD) {
    return null;
  }
  const active = TABLE_KEYBOARD_VARIANTS.find((variant) => variant.key === current);
  return (
    <Box
      component="nav"
      aria-label="Prototype variants for #1323 F29"
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 1000,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        maxWidth: 'calc(100vw - 32px)',
        padding: '6px 12px',
        borderRadius: 999,
        background: '#101014',
        boxShadow: '0 8px 24px rgb(0 0 0 / 45%)',
        color: '#fff',
      }}
    >
      <Text size="xs" fw={700}>
        #1323 table keyboard
      </Text>
      <SegmentedControl
        size="xs"
        value={current}
        onChange={(value) =>
          void navigate({
            to: '.',
            search: (previous) => ({ ...previous, variant: isTableKeyboardVariant(value) ? value : 'a' }),
            replace: true,
          })
        }
        data={TABLE_KEYBOARD_VARIANTS.map((variant) => ({ value: variant.key, label: variant.key.toUpperCase() }))}
      />
      <Text size="xs">{active?.name}</Text>
    </Box>
  );
}
