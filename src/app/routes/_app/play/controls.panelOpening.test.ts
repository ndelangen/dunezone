/* @vitest-environment jsdom */

import type * as storyTest from 'storybook/test';
import { afterEach, expect, test, vi } from 'vitest';

import { openPanel } from './controls.stories.fixture';

vi.mock('storybook/test', async () => {
  const actual = await vi.importActual<typeof storyTest>('storybook/test');
  return {
    ...actual,
    userEvent: {
      click: async (button: HTMLElement) => button.setAttribute('aria-selected', 'true'),
      unhover: async () => await new Promise((resolve) => setTimeout(resolve, 35_000)),
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

test('a selected panel finishes pointer cleanup without expiring its selection wait', async () => {
  vi.useFakeTimers();
  const button = document.createElement('button');
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', 'false');
  button.textContent = 'Spice';
  setTimeout(() => document.body.append(button), 100);
  let settled = false;
  const outcome = openPanel(document.body, 'Spice').then(
    () => {
      settled = true;
      return 'opened';
    },
    (error: unknown) => {
      settled = true;
      return error;
    }
  );
  await vi.advanceTimersByTimeAsync(30_000);
  expect(button.getAttribute('aria-selected')).toBe('true');
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(5100);
  expect(await outcome).toBe('opened');
});
