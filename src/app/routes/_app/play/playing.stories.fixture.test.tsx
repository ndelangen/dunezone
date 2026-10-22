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

test('the phase story opens Previous phase while native frames stay withheld', async () => {
  const { phaseControls } = await import('./playing.stories.fixture');
  render(
    <MantineProvider>
      <div role="group" aria-label="Phase navigation">
        <Menu withinPortal hideDetached={false}>
          <Menu.Target>
            <button aria-label="More phase actions">More</button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item>Previous phase</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    </MantineProvider>
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  let finished = false;
  const outcome = phaseControls(document.body)
    .openPrevious()
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
  expect(await outcome).toBe('Previous phase');
});
