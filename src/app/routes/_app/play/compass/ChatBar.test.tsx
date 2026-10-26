/* @vitest-environment jsdom */
import { MantineProvider, mergeThemeOverrides } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { ChatBar } from './ChatBar';
import { CompassTableContext } from './compassTable';

window.matchMedia = vi.fn().mockImplementation((media: string) => ({
  matches: false,
  media,
  addEventListener() {},
  removeEventListener() {},
}));
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);
afterEach(cleanup);

/* jsdom has no layout with which to keep an anchored tooltip attached. */
const testTheme = mergeThemeOverrides(appContentTheme, {
  components: { Tooltip: { defaultProps: { hideDetached: false, transitionProps: { duration: 0 } } } },
});

function renderChats() {
  const onShow = vi.fn();
  const result = render(
    <MantineProvider theme={testTheme} forceColorScheme="dark">
      <CompassTableContext
        value={{
          players: [
            {
              seat: 'seat-1',
              name: 'Paul',
              factionName: 'Atreides',
              token: null,
              unread: 2,
              own: false,
              canConverse: true,
              attention: false,
              ally: true,
            },
          ],
          tableChat: { unread: 3 },
          chat: () => null,
          factionInfo: () => null,
          nextPhase: null,
          token: null,
        }}
      >
        <ChatBar inert={false} isOpen={() => false} onOpenCompass={vi.fn()} onShow={onShow} />
      </CompassTableContext>
    </MantineProvider>
  );
  return { ...result, onShow };
}

test('chat tokens use the shared tooltip on hover and keep unread names and click actions', async () => {
  const { container, onShow } = renderChats();
  const chat = screen.getByRole('button', { name: 'Table chat, 3 unread' });
  fireEvent.mouseEnter(chat);
  expect((await screen.findByRole('tooltip')).textContent).toBe('Table chat · Space →');
  expect(screen.getByRole('tooltip').className).toContain('mantine-Tooltip-tooltip');
  expect(container.querySelector('[data-tip], [data-tooltip], [title]')).toBeNull();
  fireEvent.click(chat);
  expect(onShow).toHaveBeenCalledWith('table-chat');
});

test('keyboard focus exposes the player, faction and ally shortcut through the same tooltip', async () => {
  renderChats();
  const player = screen.getByRole('button', { name: 'Paul, Atreides, 2 unread' });
  fireEvent.focus(player);
  expect((await screen.findByRole('tooltip')).textContent).toBe('Paul · Atreides · ally · Space → →');
});
