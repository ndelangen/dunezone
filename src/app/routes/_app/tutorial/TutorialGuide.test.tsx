/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { stubMatchMedia } from '../play/multiplayer/jsdom.test.fixture';
import { TutorialGuide } from './TutorialGuide';
import type { GuideTask } from './TutorialGuide';

stubMatchMedia();
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
  fireEvent.click(reset, { detail: 1 });
  expect(onReset).toHaveBeenCalledTimes(1);
  expect(document.activeElement).not.toBe(reset);
  /* Enter or Space on a focused button clicks it with no pointer, and keyboard focus stays where it was. */
  reset.focus();
  fireEvent.click(reset, { detail: 0 });
  expect(onReset).toHaveBeenCalledTimes(2);
  expect(document.activeElement).toBe(reset);
});

test('rereading a completed step preserves the active task and never repeats its actions', () => {
  const completed = { ...openTheControls, begin: vi.fn(), finish: vi.fn() };
  const active = { ...openTheControls, id: 'active', task: 'Active step', begin: vi.fn(), finish: vi.fn() };
  render(
    <MantineProvider theme={appContentTheme}>
      <TutorialGuide
        number={1}
        title="Review a step"
        tasks={[completed, active]}
        firstTask={1}
        learned={[]}
        onReset={vi.fn()}
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
  const reread = screen.getByRole('button', { name: 'Open the controls (done)' });
  expect(reread.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(reread);
  expect(reread.getAttribute('aria-expanded')).toBe('true');
  expect(document.getElementById(reread.getAttribute('aria-controls')!)?.getAttribute('aria-hidden')).toBe('false');
  expect(document.querySelector('[data-state="current"]')?.textContent).toContain('Active step');
  fireEvent.click(reread);
  expect(reread.getAttribute('aria-expanded')).toBe('false');
  expect(completed.begin).not.toHaveBeenCalled();
  expect(completed.finish).not.toHaveBeenCalled();
  expect(active.begin).toHaveBeenCalledOnce();
  expect(active.finish).not.toHaveBeenCalled();
});
