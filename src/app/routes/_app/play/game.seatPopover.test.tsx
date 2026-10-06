/* @vitest-environment jsdom */
import { MantineProvider, Popover } from '@mantine/core';
import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

/* The story helper needs no router or fixture transport to open a real Mantine popover. */
vi.mock('../../storybookConfig', () => ({ pageStoryMeta: {} }));
vi.stubEnv('VITE_CONVEX_URL', 'https://storybook.invalid');

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
/* jsdom supplies no animation objects; Mantine's transition status still needs both frame callbacks. */
Element.prototype.getAnimations = () => [];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Seat() {
  const [opened, setOpened] = useState(false);
  return (
    <MantineProvider>
      <h1>Dreamrules</h1>
      {/* jsdom has no layout to decide whether the target is detached. */}
      <Popover opened={opened} onChange={setOpened} hideDetached={false}>
        <Popover.Target>
          <button onClick={() => setOpened(true)}>Seats</button>
        </Popover.Target>
        <Popover.Dropdown>
          <section aria-label="You are watching">All 6 seats are taken</section>
        </Popover.Dropdown>
      </Popover>
    </MantineProvider>
  );
}

test('the seat story opens a real popover while native frames stay withheld', async () => {
  const { seatPopover } = await import('./game.stories.fixture');
  const { resetFrameLag } = await import('@sb/storyWaits');
  resetFrameLag();
  render(<Seat />);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  const outcome = seatPopover(document.body, 'You are watching').then(
    (read) => read().getByText('All 6 seats are taken').textContent,
    (error: unknown) => error
  );
  for (let elapsed = 0; elapsed < 30_100; elapsed += 50) {
    await act(() => vi.advanceTimersByTimeAsync(50));
  }
  expect(await outcome).toBe('All 6 seats are taken');
});
