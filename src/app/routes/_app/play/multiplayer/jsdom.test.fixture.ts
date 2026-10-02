import { vi } from 'vitest';

/** jsdom has no matchMedia; Mantine reads it for the colour scheme and reduced motion, and every query matches nothing. */
export function stubMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
