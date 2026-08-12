// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { appContentTheme } from '@ui/theme';
import { Users } from 'lucide-react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssignPopover } from './AssignPopover';

const groupOption = { value: 'group-1', label: 'Arrakeen Rules Council (arrakeen-rules-council)' };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

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

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('AssignPopover', () => {
  it('places popover semantics on the focusable trigger and returns focus when closed', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MantineProvider theme={appContentTheme} forceColorScheme="light">
          <AssignPopover
            noun="group"
            icon={<Users size={17} aria-hidden />}
            disabled={false}
            onAssign={vi.fn(async () => undefined)}
            options={[groupOption]}
          />
        </MantineProvider>
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Assign group"]');
    expect(trigger).not.toBeNull();
    if (!trigger) {
      return;
    }

    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.hasAttribute('aria-controls')).toBe(false);

    trigger.focus();
    await act(async () => trigger.click());

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const controlsId = trigger.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(document.getElementById(controlsId as string)).not.toBeNull();
    const searchInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="Type group name…"]'
    );
    expect(searchInput).not.toBeNull();
    if (!searchInput) {
      return;
    }
    searchInput.focus();

    await act(async () => {
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('submits only a selected option and closes after success', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const onAssign = vi.fn(async () => undefined);

    await act(async () => {
      root?.render(
        <MantineProvider theme={appContentTheme} forceColorScheme="light">
          <AssignPopover
            noun="group"
            icon={<Users size={17} aria-hidden />}
            disabled={false}
            onAssign={onAssign}
            options={[groupOption]}
          />
        </MantineProvider>
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Assign group"]');
    expect(trigger).not.toBeNull();
    if (!trigger) {
      return;
    }
    await act(async () => trigger.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));

    const searchInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="Type group name…"]'
    );
    expect(searchInput).not.toBeNull();
    if (!searchInput) {
      return;
    }
    await act(async () => searchInput.click());

    const option = document.querySelector<HTMLElement>('[role="option"]');
    expect(option?.textContent).toContain('Arrakeen Rules Council');
    if (!option) {
      return;
    }
    await act(async () => option.click());

    const assignButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Assign selected group')
    );
    expect(assignButton).toBeDefined();
    if (!assignButton) {
      return;
    }
    await act(async () => assignButton.click());

    expect(onAssign).toHaveBeenCalledOnce();
    expect(onAssign).toHaveBeenCalledWith('group-1');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('normalizes an unknown assignment failure once and keeps the picker open', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MantineProvider theme={appContentTheme} forceColorScheme="light">
          <AssignPopover
            noun="group"
            icon={<Users size={17} aria-hidden />}
            disabled={false}
            onAssign={vi.fn(async () => {
              throw 'transport failure';
            })}
            options={[groupOption]}
          />
        </MantineProvider>
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Assign group"]');
    expect(trigger).not.toBeNull();
    if (!trigger) {
      return;
    }
    await act(async () => trigger.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));

    const searchInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="Type group name…"]'
    );
    expect(searchInput).not.toBeNull();
    if (!searchInput) {
      return;
    }
    await act(async () => searchInput.click());
    const option = document.querySelector<HTMLElement>('[role="option"]');
    expect(option).not.toBeNull();
    if (!option) {
      return;
    }
    await act(async () => option.click());

    const assignButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Assign selected group')
    );
    expect(assignButton).toBeDefined();
    if (!assignButton) {
      return;
    }
    await act(async () => assignButton.click());

    const alerts = document.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toContain('Could not assign the group. Try again.');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });
});
