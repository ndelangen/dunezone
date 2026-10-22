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

test('the bidding story opens its settings while native frames stay withheld', async () => {
  const { openBiddingSettings } = await import('./bidding.stories.fixture');
  render(
    <MantineProvider>
      <Menu withinPortal hideDetached={false}>
        <Menu.Target>
          <button>Game menu</button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.CheckboxItem checked={false} onChange={() => {}}>
            Timed bidding
          </Menu.CheckboxItem>
        </Menu.Dropdown>
      </Menu>
    </MantineProvider>
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  let finished = false;
  const outcome = openBiddingSettings(document.body)
    .then(
      (item) => item.textContent,
      (error: unknown) => error
    )
    .finally(() => {
      finished = true;
    });
  for (let elapsed = 0; !finished && elapsed < 10_100; elapsed += 50) {
    await vi.advanceTimersByTimeAsync(50);
  }
  expect(await outcome).toBe('Timed bidding');
});
