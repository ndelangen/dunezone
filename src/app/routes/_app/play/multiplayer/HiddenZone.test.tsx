/** @vitest-environment jsdom */

import { MantineProvider, Menu } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { HandPieceMenu } from './HiddenZone';
import { stubMatchMedia } from './jsdom.test.fixture';

stubMatchMedia();
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

test('the menu anchors at the pointer on the body, outside a window whose transform would re-base a fixed anchor', () => {
  const { container } = render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <section data-window="hand" style={{ transform: 'translateX(-50%)', backdropFilter: 'blur(10px)' }}>
        <HandPieceMenu anchor={{ pieceId: 'card', x: 63, y: 559 }} label="Hand actions" onClose={vi.fn()}>
          <Menu.Item>Move to hidden zone</Menu.Item>
        </HandPieceMenu>
      </section>
    </MantineProvider>
  );
  const anchor = document.body.querySelector<HTMLElement>('span[aria-hidden][style*="fixed"]')!;
  expect(anchor).not.toBeNull();
  expect(container.contains(anchor)).toBe(false);
  expect(anchor.style.left).toBe('63px');
  expect(anchor.style.top).toBe('559px');
  expect(screen.getByRole('menuitem', { name: 'Move to hidden zone' })).toBeDefined();
});
