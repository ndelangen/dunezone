/* @vitest-environment jsdom */
import { Accordion, MantineProvider } from '@mantine/core';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

/* Native frames stay stopped; the scene story must deliver the accordion's opening frames. */
vi.hoisted(() => {
  let frameId = 0;
  window.requestAnimationFrame = () => ++frameId;
  window.cancelAnimationFrame = () => {};
});
window.matchMedia = vi.fn().mockImplementation((media: string) => ({
  matches: false,
  media,
  addEventListener() {},
  removeEventListener() {},
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test.each([
  { section: 'Annotations (0)', action: 'Add annotation' },
  { section: 'Routes (0)', action: 'Add route' },
])('the scene story adds through $section while native frames stay withheld', async ({ section, action }) => {
  const { addSceneItem } = await import('./rulebookSceneInteractions.stories.fixture');
  const add = vi.fn();
  render(
    <MantineProvider>
      <Accordion>
        <Accordion.Item value="section">
          <Accordion.Control>{section}</Accordion.Control>
          <Accordion.Panel>
            <button onClick={add}>{action}</button>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </MantineProvider>
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  let finished = false;
  const outcome = addSceneItem(document.body, section, action)
    .then(
      () => undefined,
      (error: unknown) => error
    )
    .finally(() => {
      finished = true;
    });
  for (let elapsed = 0; !finished && elapsed < 10_100; elapsed += 50) {
    await vi.advanceTimersByTimeAsync(50);
  }
  expect(await outcome).toBeUndefined();
  expect(add).toHaveBeenCalledOnce();
});
