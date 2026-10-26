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
/* The menu probes do not mount game routes or install transports. */
vi.mock('./game.stories.fixture', () => ({ install: vi.fn() }));
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
  {
    name: 'table settings',
    trigger: 'Game menu',
    item: 'Stack counts',
    load: async () => {
      const { openTableSettings } = await import('./table.stories.fixture');
      return () => openTableSettings(document.body);
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
            {name !== 'phase' ? (
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
  expect(await menuOutcome(async () => (await open()).textContent)).toBe(item);
});

/* The closing pane becomes invisible before Mantine removes it from the document. */
test.each([true, false])(
  'the phase story checks visibility after Escape with closeOnEscape=%s',
  async (closeOnEscape) => {
    const { phaseControls } = await import('./playing.stories.fixture');
    render(
      <MantineProvider>
        <div role="group" aria-label="Phase navigation">
          <Menu
            withinPortal
            hideDetached={false}
            closeOnEscape={closeOnEscape}
            transitionProps={{ exitDuration: 20_000 }}
          >
            <Menu.Target>
              <button>More phase actions</button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item>Previous phase</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </MantineProvider>
    );
    const outcome = await menuOutcome(() => phaseControls(document.body).expectPrevious(true));
    if (closeOnEscape) {
      expect(outcome).toBeUndefined();
      expect(document.body.querySelector('[role="menu"]')?.getAttribute('style')).toContain('opacity: 0');
    } else {
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toContain('visible');
    }
  }
);

async function menuOutcome(work: () => Promise<unknown>) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  let finished = false;
  const outcome = work()
    .catch((error: unknown) => error)
    .finally(() => {
      finished = true;
    });
  for (let elapsed = 0; !finished && elapsed < 10_100; elapsed += 50) {
    await vi.advanceTimersByTimeAsync(50);
  }
  return outcome;
}
