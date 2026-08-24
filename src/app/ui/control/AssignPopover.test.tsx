// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { fireEvent } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { Users } from 'lucide-react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssignOptions, AssignPopover } from './AssignPopover';

const groupOption = { value: 'group-1', label: 'Arrakeen Rules Council (arrakeen-rules-council)' };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

/* jsdom has no layout, so Mantine's scroll-selected-option-into-view call needs a stub the way ResizeObserver does. */
HTMLElement.prototype.scrollIntoView = vi.fn();

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
  it('mounts its content only while open, which is what makes a Picker inside it lazy', async () => {
    /* A Picker mounted here starts its read on mount. If the shell rendered its children eagerly and
       merely hid them, every such read would fire on page load, which is the whole defect this shape
       exists to prevent. A story cannot show this: it can only show what appears after the click. */
    const mounted = vi.fn();
    function Probe() {
      mounted();
      return <span>pane content</span>;
    }

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MantineProvider theme={appContentTheme} forceColorScheme="light">
          <AssignPopover noun="group" icon={<Users size={17} aria-hidden />} disabled={false}>
            <Probe />
          </AssignPopover>
        </MantineProvider>
      );
    });

    expect(mounted).not.toHaveBeenCalled();

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Assign group"]');
    expect(trigger).not.toBeNull();
    if (!trigger) {
      return;
    }
    await act(async () => trigger.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));

    expect(mounted).toHaveBeenCalled();

    await act(async () => trigger.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));

    expect(document.body.textContent).not.toContain('pane content');

    /* And each opening is a fresh mount: a read starts again rather than resuming, and a cancelled pick
       cannot reappear. Both halves currently hold whether or not the shell gates on `opened` itself,
       because Mantine's dropdown declines to render its children while closed. This asserts the
       property rather than the mechanism, so it still catches the change that matters: a dropdown kept
       mounted, or content moved outside it. */
    await act(async () => trigger.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));

    expect(mounted).toHaveBeenCalledTimes(2);
  });

  it('places popover semantics on the focusable trigger and returns focus when closed', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MantineProvider theme={appContentTheme} forceColorScheme="light">
          <AssignPopover noun="group" icon={<Users size={17} aria-hidden />} disabled={false}>
            <AssignOptions options={[groupOption]} onAssign={vi.fn(async () => undefined)} />
          </AssignPopover>
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
    const searchInput = document.querySelector<HTMLInputElement>('input[placeholder="Type group name…"]');
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

  it('commits the chosen option and closes after success', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const onAssign = vi.fn(async () => undefined);

    await act(async () => {
      root?.render(
        <MantineProvider theme={appContentTheme} forceColorScheme="light">
          <AssignPopover noun="group" icon={<Users size={17} aria-hidden />} disabled={false}>
            <AssignOptions options={[groupOption]} onAssign={onAssign} />
          </AssignPopover>
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

    /* The suggestions are inline in the pane, not a nested dropdown: the option exists without opening anything further. */
    const option = document.querySelector<HTMLElement>('[role="option"]');
    expect(option?.textContent).toContain('Arrakeen Rules Council');
    if (!option) {
      return;
    }
    await act(async () => option.click());

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
          <AssignPopover noun="group" icon={<Users size={17} aria-hidden />} disabled={false}>
            <AssignOptions
              options={[groupOption]}
              onAssign={vi.fn(async () => {
                throw 'transport failure';
              })}
            />
          </AssignPopover>
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

    const option = document.querySelector<HTMLElement>('[role="option"]');
    expect(option).not.toBeNull();
    if (!option) {
      return;
    }
    await act(async () => option.click());

    const alerts = document.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toContain('Could not assign the group. Try again.');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });
  it('typing and pressing Enter commits the highlighted option', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const onAssign = vi.fn(async () => undefined);

    await act(async () => {
      root?.render(
        <MantineProvider theme={appContentTheme} forceColorScheme="light">
          <AssignPopover noun="group" icon={<Users size={17} aria-hidden />} disabled={false}>
            <AssignOptions
              options={[groupOption, { value: 'group-2', label: 'Spice Cartel (spice-cartel)' }]}
              onAssign={onAssign}
            />
          </AssignPopover>
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

    const searchInput = document.querySelector<HTMLInputElement>('input[placeholder="Type group name…"]');
    expect(searchInput).not.toBeNull();
    if (!searchInput) {
      return;
    }
    searchInput.focus();
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'spice' } });
    });
    await act(async () => {
      fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
    });

    expect(onAssign).toHaveBeenCalledOnce();
    expect(onAssign).toHaveBeenCalledWith('group-2');
  });
});
