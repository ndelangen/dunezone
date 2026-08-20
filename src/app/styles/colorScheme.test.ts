/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { setSchemePreference } from './colorScheme';

/*
 * Contract of the scheme seam: the stored preference plus the OS hint resolve to one verdict,
 * mirrored onto the html attribute. Internals (listener wiring, hook plumbing) stay untested.
 */

function stubSystemPreference(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function appliedScheme() {
  return document.documentElement.getAttribute('data-mantine-color-scheme');
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-mantine-color-scheme');
  setSchemePreference('system');
  vi.restoreAllMocks();
});

describe('setSchemePreference', () => {
  it('pins the chosen scheme and persists it', () => {
    stubSystemPreference(false);

    setSchemePreference('dark');

    expect(appliedScheme()).toBe('dark');
    expect(localStorage.getItem('dunezone-color-scheme')).toBe('dark');
  });

  it('returns to the OS hint when set back to system', () => {
    stubSystemPreference(true);
    setSchemePreference('light');

    setSchemePreference('system');

    expect(appliedScheme()).toBe('dark');
    expect(localStorage.getItem('dunezone-color-scheme')).toBeNull();
  });

  it('keeps an explicit choice for the page view when storage is blocked', () => {
    stubSystemPreference(false);
    const throwing = vi.fn(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(throwing);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(throwing);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(throwing);

    setSchemePreference('dark');

    expect(appliedScheme()).toBe('dark');
  });
});
