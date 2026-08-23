// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectedTabs } from './ConnectedTabs';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const resizeObserverCallbacks: ResizeObserverCallback[] = [];

class ResizeObserverStub {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallbacks.push(callback);
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

const items = [
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
] as const;

function rect({ left, top, width, height }: { left: number; top: number; width: number; height: number }): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}

function Fixture() {
  const [value, setValue] = useState('first');
  return <ConnectedTabs value={value} onValueChange={setValue} ariaLabel="Example sections" items={items} />;
}

function getTab(name: string) {
  const tab = [...(container?.querySelectorAll('[role="tab"]') ?? [])].find(
    (candidate) => candidate.textContent?.trim() === name
  );
  if (!(tab instanceof HTMLButtonElement)) {
    throw new Error(`Missing tab: ${name}`);
  }
  return tab;
}

function getButton(name: string) {
  const button = [...(container?.querySelectorAll('button') ?? [])].find(
    (candidate) => candidate.getAttribute('aria-label') === name
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${name}`);
  }
  return button;
}

/** One layout pass: the component only remeasures when its observers fire. */
async function flushResizeObservers() {
  await act(async () => {
    for (const callback of resizeObserverCallbacks) {
      callback([], {} as ResizeObserver);
    }
  });
}

/** Jsdom measures everything as zero, so the three elements the hook reads are mocked together. */
function mockGeometry(
  elements: { tabsRoot: HTMLElement; panelShell: HTMLElement; activeTab: HTMLElement },
  dimensions: { width: number; height: number; panelX: number; tabHeight: number }
) {
  vi.spyOn(elements.tabsRoot, 'getBoundingClientRect').mockImplementation(() =>
    rect({ left: 0, top: 0, width: dimensions.width, height: dimensions.height })
  );
  vi.spyOn(elements.panelShell, 'getBoundingClientRect').mockImplementation(() =>
    rect({
      left: dimensions.panelX,
      top: 0,
      width: dimensions.width - dimensions.panelX,
      height: dimensions.height,
    })
  );
  vi.spyOn(elements.activeTab, 'getBoundingClientRect').mockImplementation(() =>
    rect({ left: 0, top: 0, width: dimensions.panelX, height: dimensions.tabHeight })
  );
}

beforeEach(async () => {
  resizeObserverCallbacks.length = 0;
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
  if (root) {
    await act(async () => root?.unmount());
  }
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

  it('emits selection requests without owning the selected tab', async () => {
    const onValueChange = vi.fn();
    await act(async () =>
      root?.render(
        <ConnectedTabs value="first" onValueChange={onValueChange} ariaLabel="Example sections" items={items} />
      )
    );

    const middle = getTab('2Middle');
    await act(async () => {
      middle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      middle.click();
    });

    expect(onValueChange).toHaveBeenCalledWith('middle');
    expect(getTab('1First').getAttribute('data-state')).toBe('active');
    expect(middle.getAttribute('data-state')).toBe('inactive');
    expect(container?.textContent).toContain('First panel');

    await act(async () =>
      root?.render(
        <ConnectedTabs value="middle" onValueChange={onValueChange} ariaLabel="Example sections" items={items} />
      )
    );

    expect(getTab('2Middle').getAttribute('data-state')).toBe('active');
    expect(container?.textContent).toContain('Middle panel');
  });

  it('updates the joined surface throughout width and content-height changes', async () => {
    const tabList = container?.querySelector('[role="tablist"]');
    const tabsRoot = tabList?.parentElement;
    const panelShell = container?.querySelector('[role="tabpanel"]')?.parentElement;
    const activeTab = getTab('1First');
    if (!tabsRoot || !panelShell) {
      throw new Error('Missing connected-tabs geometry elements');
    }

    const dimensions = { width: 760, height: 400, panelX: 180, tabHeight: 64 };
    mockGeometry({ tabsRoot, panelShell, activeTab }, dimensions);
    await flushResizeObservers();

    const contour = container?.querySelector<SVGPathElement>('svg[class*="geometryContour"] path');
    const contourSvg = contour?.closest('svg');
    let previousPath = contour?.getAttribute('d');
    expect(contourSvg?.getAttribute('viewBox')).toBe('0 0 760 400');

    for (const frame of [
      { width: 680, height: 500, panelX: 170 },
      { width: 600, height: 610, panelX: 158 },
      { width: 520, height: 720, panelX: 148 },
    ]) {
      Object.assign(dimensions, frame);
      await flushResizeObservers();

      expect(contourSvg?.getAttribute('viewBox')).toBe(`0 0 ${frame.width} ${frame.height}`);
      expect(contour?.getAttribute('d')).not.toBe(previousPath);
      previousPath = contour?.getAttribute('d');
    }
  });

  it('uses automatic Radix keyboard activation and focus movement', async () => {
    const first = getTab('1First');
    const middle = getTab('2Middle');

    first.focus();
    await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));

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

  it('steps through enabled items in the compact picker and wraps', async () => {
    const next = getButton('Next section');
    const previous = getButton('Previous section');

    await act(async () => next.click());
    expect(getTab('2Middle').getAttribute('data-state')).toBe('active');
    expect(container?.textContent).toContain('Middle panel');

    await act(async () => previous.click());
    expect(getTab('1First').getAttribute('data-state')).toBe('active');

    await act(async () => previous.click());
    expect(getTab('3Final').getAttribute('data-state')).toBe('active');
    expect(container?.textContent).toContain('Final panel');
  });

  it('preserves disabled trigger semantics', () => {
    const disabled = getTab('4Unavailable');
    expect(disabled.disabled).toBe(true);
    expect(disabled.hasAttribute('data-disabled')).toBe(true);
  });
});
