/* @vitest-environment jsdom */

import type * as storyTest from 'storybook/test';
import { afterEach, expect, test, vi } from 'vitest';

import { openPanel } from './controls.stories.fixture';
import { press } from './gameInteractions.stories.fixture';

const delays = vi.hoisted(() => ({ click: 0, unhover: 0 }));

vi.mock('storybook/test', async () => {
  const actual = await vi.importActual<typeof storyTest>('storybook/test');
  return {
    ...actual,
    userEvent: {
      click: async (button: HTMLElement) => {
        button.setAttribute('aria-selected', 'true');
        if (delays.click) {
          await new Promise((resolve) => setTimeout(resolve, delays.click));
        }
      },
      unhover: async () => {
        if (delays.unhover) {
          await new Promise((resolve) => setTimeout(resolve, delays.unhover));
        }
      },
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  delays.click = 0;
  delays.unhover = 0;
});

test.each([
  { name: 'pointer cleanup', click: 0, unhover: 35_000 },
  { name: 'click processing', click: 35_000, unhover: 0 },
])('a selected panel finishes $name without expiring its selection wait', async ({ click, unhover }) => {
  vi.useFakeTimers();
  delays.click = click;
  delays.unhover = unhover;
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

test('a menu click finishes processing without expiring its arrival wait', async () => {
  vi.useFakeTimers();
  delays.click = 35_000;
  const button = document.createElement('button');
  button.textContent = 'Game menu';
  setTimeout(() => document.body.append(button), 100);
  const outcome = press(() => {
    const target = document.querySelector('button');
    if (!target) {
      throw new Error('The menu button has not arrived');
    }
    return target;
  }).then(
    () => 'clicked',
    (error: unknown) => error
  );
  await vi.advanceTimersByTimeAsync(35_100);
  expect(button.getAttribute('aria-selected')).toBe('true');
  expect(await outcome).toBe('clicked');
});
