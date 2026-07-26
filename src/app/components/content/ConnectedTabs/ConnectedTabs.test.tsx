// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConnectedTabsPath, ConnectedTabs } from './ConnectedTabs';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

function Fixture() {
  const [value, setValue] = useState('first');
  return (
    <ConnectedTabs
      value={value}
      onValueChange={setValue}
      ariaLabel="Example sections"
      items={[
        {
          value: 'first',
          label: 'First',
          icon: <span>1</span>,
          panel: <p>First panel</p>,
        },
        {
          value: 'middle',
          label: 'Middle',
          icon: <span>2</span>,
          panel: <p>Middle panel</p>,
        },
        {
          value: 'final',
          label: 'Final',
          icon: <span>3</span>,
          panel: <p>Final panel</p>,
        },
        {
          value: 'disabled',
          label: 'Unavailable',
          icon: <span>4</span>,
          disabled: true,
          panel: <p>Unavailable panel</p>,
        },
      ]}
    />
  );
}

function getTab(name: string) {
  const tab = [...(container?.querySelectorAll('[role="tab"]') ?? [])].find(
    (candidate) => candidate.textContent?.trim() === name
  );
  if (!(tab instanceof HTMLButtonElement)) throw new Error(`Missing tab: ${name}`);
  return tab;
}

beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn().mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Fixture />));
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ConnectedTabs', () => {
  it('renders the joined surface for the initially selected tab before interaction', () => {
    expect(container?.querySelector('[class*="glassSurface"]')).not.toBeNull();
    expect(container?.querySelector('svg[class*="geometryContour"] path')).not.toBeNull();
  });

  it('uses automatic Radix keyboard activation and focus movement', async () => {
    const first = getTab('1First');
    const middle = getTab('2Middle');

    first.focus();
    await act(async () =>
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    );

    expect(document.activeElement).toBe(middle);
    expect(middle.getAttribute('data-state')).toBe('active');
    expect(container?.textContent).toContain('Middle panel');
  });

  it('supports pointer activation with controlled state', async () => {
    const final = getTab('3Final');
    await act(async () => {
      final.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      final.click();
    });

    expect(final.getAttribute('data-state')).toBe('active');
    expect(container?.textContent).toContain('Final panel');
  });

  it('preserves disabled trigger semantics', () => {
    const disabled = getTab('4Unavailable');
    expect(disabled.disabled).toBe(true);
    expect(disabled.hasAttribute('data-disabled')).toBe(true);
  });

  it('builds distinct joined contours for first, middle, and final tabs', () => {
    const shared = { width: 800, height: 600, panelX: 180, radius: 8 };
    const first = buildConnectedTabsPath({ ...shared, tabTop: 0, tabBottom: 64 });
    const middle = buildConnectedTabsPath({ ...shared, tabTop: 144, tabBottom: 208 });
    const final = buildConnectedTabsPath({ ...shared, tabTop: 536, tabBottom: 600 });

    expect(new Set([first, middle, final]).size).toBe(3);
    expect(first).toContain('M 8 0');
    expect(middle).toContain('V 211');
    expect(final).toContain('H 8');
  });
});
