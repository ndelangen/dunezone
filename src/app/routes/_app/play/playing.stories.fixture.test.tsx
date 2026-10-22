/* @vitest-environment jsdom */
import { MantineProvider, Menu } from '@mantine/core';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

/* Only the story wait can deliver these frames. */
vi.hoisted(() => {
  let nextFrame = 0;
  window.requestAnimationFrame = () => ++nextFrame;
  window.cancelAnimationFrame = () => {};
});
vi.mock('@db/core', () => ({ db: {} }));
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
/* jsdom supplies no CSS animation objects. */
Element.prototype.getAnimations = () => [];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test.each([
  {
    name: 'phase',
    trigger: 'More phase actions',
    item: 'Previous phase',
    load: async () => {
      const { phaseControls } = await import('./playing.stories.fixture');
      return () => phaseControls(document.body).openPrevious();
    },
  },
  {
    name: 'bidding',
    trigger: 'Game menu',
    item: 'Timed bidding',
    load: async () => {
      const { openBiddingSettings } = await import('./bidding.stories.fixture');
      return () => openBiddingSettings(document.body);
    },
  },
])('the $name story opens its menu while native frames stay withheld', async ({ name, trigger, item, load }) => {
  const open = await load();
  render(
    <MantineProvider>
      <div role="group" aria-label="Phase navigation">
        <Menu withinPortal hideDetached={false}>
          <Menu.Target>
            <button aria-label={trigger}>{trigger}</button>
          </Menu.Target>
          <Menu.Dropdown>
            {name === 'bidding' ? (
              <Menu.CheckboxItem checked={false} onChange={() => {}}>
                {item}
              </Menu.CheckboxItem>
            ) : (
              <Menu.Item>{item}</Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </div>
    </MantineProvider>
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  let finished = false;
  const outcome = open()
    .then(
      (control) => control.textContent,
      (error: unknown) => error
    )
    .finally(() => {
      finished = true;
    });
  for (let elapsed = 0; !finished && elapsed < 10_100; elapsed += 50) {
    await vi.advanceTimersByTimeAsync(50);
  }
  expect(await outcome).toBe(item);
});
