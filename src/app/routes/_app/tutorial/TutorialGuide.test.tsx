/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { TutorialGuide } from './TutorialGuide';
import type { GuideTask } from './TutorialGuide';

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

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

const openTheControls: GuideTask = {
  id: 'open-compass',
  task: 'Open the controls',
  detail: 'Press {Space}.',
  anchor: { kind: 'page', element: () => null },
  begin: () => undefined,
  done: () => false,
};

test('Reset lets go of the focus, so the Space the first task asks for reaches the table rather than resetting again', () => {
  const onReset = vi.fn();
  render(
    <MantineProvider theme={appContentTheme}>
      <TutorialGuide
        number={8}
        title="Windows"
        tasks={[openTheControls]}
        learned={[]}
        onReset={onReset}
        chaptersLink={(props) => (
          <a href="/tutorial" {...props}>
            Back to chapters
          </a>
        )}
      >
        <div />
      </TutorialGuide>
    </MantineProvider>
  );
  const reset = screen.getByRole('button', { name: 'Reset' });
  /* A click focuses the button it lands on, as Chrome does. */
  reset.focus();
  fireEvent.click(reset);
  expect(onReset).toHaveBeenCalledTimes(1);
  expect(document.activeElement).not.toBe(reset);
});
