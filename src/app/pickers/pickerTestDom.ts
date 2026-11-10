import { cleanup, fireEvent } from '@testing-library/react';
import { vi } from 'vite-plus/test';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Gives jsdom the browser parts a Mantine combobox reaches for. Call it in beforeEach. */
export function stubPickerDom() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
}

/** Undoes stubPickerDom and unmounts. Call it in afterEach. */
export function resetPickerDom() {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}

/** Types into a picker's search box, if text is given, and presses Enter there. */
export function searchAndEnter(searchbox: HTMLElement, text?: string) {
  if (text !== undefined) {
    fireEvent.change(searchbox, { target: { value: text } });
  }
  fireEvent.keyDown(searchbox, { key: 'Enter', code: 'Enter' });
}
