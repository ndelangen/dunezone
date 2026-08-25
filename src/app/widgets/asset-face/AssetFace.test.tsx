// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { cleanup, render } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { AssetFace } from './AssetFace';

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

afterEach(cleanup);

function renderFace(children: ReactNode) {
  return render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      {children}
    </MantineProvider>
  );
}

/*
 * The migration rewrites production tokens to mode `same` at deploy, so this branch renders live
 * content the moment the slice ships; the contract is pinned here because no story can hold a
 * same-mode token until the editor able to author one lands.
 */
const front = {
  background: {
    image: '/image/texture/015.jpg',
    colors: ['#4B4C0D', '#262B04'],
    influence: 0.5,
    invert: true,
    definition: 0,
  },
  image: '/vector/decal/amal.svg',
  top: 'FRONT ARC TEXT',
  ring: true,
};

describe('a token back with mode same', () => {
  test('draws the front face rather than the neutral fallback', () => {
    const { container } = renderFace(
      <AssetFace
        type="token-disc"
        data={{ name: 'Spice', about: '', front, back: { mode: 'same' } }}
        name="Spice"
        side="back"
      />
    );
    expect(container.textContent).toContain('FRONT ARC TEXT');
  });

  test('a dangling reference still falls to the neutral face, unchanged', () => {
    const { container } = renderFace(
      <AssetFace
        type="token-disc"
        data={{ name: 'Spice', about: '', front, back: { mode: 'reference' } }}
        name="Spice"
        side="back"
      />
    );
    expect(container.textContent).not.toContain('FRONT ARC TEXT');
  });
});
