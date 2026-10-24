import { playUiColors } from '@shared/uiPalette';
import { useSyncExternalStore } from 'react';

/** The tint the paintbrush adds territories to or takes them out of, and how a click on the board reaches the table. */
export type TerritoryBrush = Readonly<{
  tintId: string;
  paint: (territory: Readonly<{ id: string; name: string }>) => void;
}>;

let brush: TerritoryBrush | null = null;
const listeners = new Set<() => void>();

function stopOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    setTerritoryBrush(null);
  }
}

/** Turns the paintbrush on for one tint, or off with null; Escape turns it off too. One page has one brush. */
export function setTerritoryBrush(next: TerritoryBrush | null) {
  if (brush === next) {
    return;
  }
  brush = next;
  /* Captured, since a focused panel control may keep Escape to itself. */
  if (next) {
    window.addEventListener('keydown', stopOnEscape, true);
  } else {
    window.removeEventListener('keydown', stopOnEscape, true);
  }
  for (const listener of listeners) {
    listener();
  }
}

export function territoryBrush() {
  return brush;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTerritoryBrush() {
  return useSyncExternalStore(subscribe, territoryBrush, () => null);
}

/* Lucide's brush, light over a dark edge so it reads on sand and on rock; its tip, bottom left, is where the click lands. */
const BRUSH_PATHS = [
  'm11 10 3 3',
  'M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z',
  'M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031',
];
const stroked = (color: string, width: number) =>
  `<g fill='none' stroke='${color}' stroke-width='${width}' stroke-linecap='round' stroke-linejoin='round'>${BRUSH_PATHS.map((d) => `<path d='${d}'/>`).join('')}</g>`;
const BRUSH_ICON = `<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'><g transform='translate(1 1)'>${stroked(playUiColors.brushOutline, 4)}${stroked(playUiColors.brushInk, 2)}</g></svg>`;
export const BRUSH_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(BRUSH_ICON)}") 4 22, crosshair`;
