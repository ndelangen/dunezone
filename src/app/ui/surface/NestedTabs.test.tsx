// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appContentTheme } from '../theme';
import { NestedTabs } from './NestedTabs';

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

let container: HTMLDivElement | undefined;
let root: Root | undefined;

function Fixture({ activePath = ['page-2', 'block-b'] }: { activePath?: readonly string[] }) {
  return (
    <MantineProvider theme={appContentTheme}>
      <NestedTabs activePath={activePath} ariaLabel="Example navigator">
        <NestedTabs.Level label="Pages">
          <NestedTabs.Item as="a" href="#page-1" path={['page-1']} label="Page 1" icon={<span>1</span>} />
          <NestedTabs.Item as="a" href="#page-2" path={['page-2']} label="Page 2" icon={<span>2</span>} />
          <NestedTabs.Tools>
            <button type="button">Add page</button>
          </NestedTabs.Tools>
        </NestedTabs.Level>
        <NestedTabs.Level label="Page">
          <NestedTabs.Item as="a" href="#details" path={['page-2', 'details']} label="Details" icon={<span>D</span>} />
          <NestedTabs.Group label="Main content" icon={<span>G</span>}>
            <NestedTabs.Item
              as="a"
              href="#block-a"
              path={['page-2', 'block-a']}
              label="Block a"
              icon={<span>A</span>}
            />
            <NestedTabs.Item
              as="a"
              href="#block-b"
              path={['page-2', 'block-b']}
              label="Block b"
              icon={<span>B</span>}
            />
          </NestedTabs.Group>
        </NestedTabs.Level>
        <NestedTabs.ContentPanel aria-label="Editor panel">
          <p>Editor</p>
        </NestedTabs.ContentPanel>
      </NestedTabs>
    </MantineProvider>
  );
}

function item(label: string) {
  const match = container?.querySelector(`[data-nested-tabs-item][aria-label="${label}"]`);
  if (!(match instanceof HTMLAnchorElement)) {
    throw new Error(`Missing NestedTabs Item: ${label}`);
  }
  return match;
}

beforeEach(async () => {
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
  container = undefined;
  root = undefined;
});

describe('NestedTabs', () => {
  it('accepts compound children retained across a module refresh', async () => {
    vi.resetModules();
    const { NestedTabs: ReloadedNestedTabs } = await import('./NestedTabs');

    expect(ReloadedNestedTabs.Level).not.toBe(NestedTabs.Level);

    await act(async () =>
      root?.render(
        <MantineProvider theme={appContentTheme}>
          <ReloadedNestedTabs activePath={['root', 'nested']} ariaLabel="Refreshed navigator">
            <NestedTabs.Level label="Root level">
              <NestedTabs.Item as="a" href="#root" path={['root']} label="Root item" icon={<span>R</span>} />
              <NestedTabs.Tools>
                <button type="button">Root tool</button>
              </NestedTabs.Tools>
            </NestedTabs.Level>
            <NestedTabs.Level label="Nested level">
              <ReloadedNestedTabs.Group label="Refreshed group">
                <NestedTabs.Item
                  as="a"
                  href="#nested"
                  path={['root', 'nested']}
                  label="Nested item"
                  icon={<span>N</span>}
                />
              </ReloadedNestedTabs.Group>
            </NestedTabs.Level>
            <NestedTabs.ContentPanel aria-label="Refreshed content">Content</NestedTabs.ContentPanel>
          </ReloadedNestedTabs>
        </MantineProvider>
      )
    );

    expect(container?.querySelector('[aria-label="Refreshed navigator"]')).not.toBeNull();
  });

  it('preserves typed TanStack Link destination props', () => {
    const typedItem = (
      <NestedTabs.Item
        as={Link}
        to="/preview/sheet/$factionSlug"
        params={{ factionSlug: 'atreides' }}
        search={{ mode: 'db' }}
        path={['page-2', 'preview']}
        label="Preview"
        icon={<span>P</span>}
      />
    );

    expect(typedItem.props.to).toBe('/preview/sheet/$factionSlug');
  });

  it('marks the active path without assigning tab semantics', () => {
    expect(item('Page 1').dataset.pathState).toBe('inactive');
    expect(item('Page 2').dataset.pathState).toBe('ancestor');
    expect(item('Block b').dataset.pathState).toBe('active');
    expect(item('Block b').getAttribute('aria-current')).toBe('page');
    expect(item('Page 2').hasAttribute('aria-current')).toBe(false);
    expect(container?.querySelector('[role="tab"]')).toBeNull();
    expect(container?.querySelectorAll('nav')).toHaveLength(2);
  });

  it('derives containing Group state from its active descendant', () => {
    expect(container?.querySelector('[data-contains-active-item="true"]')).not.toBeNull();
    expect(container?.querySelector('[data-contains-active-item="true"]')?.hasAttribute('aria-current')).toBe(false);
  });

  it('uses the required label as the icon-only link accessible name', () => {
    expect(item('Details').textContent).toBe('D');
    expect(item('Details').getAttribute('aria-label')).toBe('Details');
  });

  it('keeps tools at Level scope and panel content in a labelled section', () => {
    expect(container?.querySelector('button')?.textContent).toBe('Add page');
    expect(container?.querySelector('section[aria-label="Editor panel"]')?.textContent).toBe('Editor');
  });

  it('draws one connected contour for each nested transition', () => {
    expect(container?.querySelectorAll('[data-nested-tabs-surface]')).toHaveLength(2);
    expect(container?.querySelector('[data-nested-tabs-surface="level"] path')).not.toBeNull();
    expect(container?.querySelector('[data-nested-tabs-surface="panel"] path')).not.toBeNull();
  });

  it('connects a single level straight to the content panel', async () => {
    await act(async () =>
      root?.render(
        <MantineProvider theme={appContentTheme}>
          <NestedTabs activePath={['page-2']} ariaLabel="Single level">
            <NestedTabs.Level label="Pages">
              <NestedTabs.Item as="a" href="#page-1" path={['page-1']} label="Page 1" icon={<span>1</span>} />
              <NestedTabs.Item as="a" href="#page-2" path={['page-2']} label="Page 2" icon={<span>2</span>} />
            </NestedTabs.Level>
            <NestedTabs.ContentPanel aria-label="Page panel">
              <p>Page</p>
            </NestedTabs.ContentPanel>
          </NestedTabs>
        </MantineProvider>
      )
    );
    expect(container?.querySelector('[data-nested-tabs-levels]')?.getAttribute('data-nested-tabs-levels')).toBe('1');
    expect(container?.querySelectorAll('[data-nested-tabs-surface]')).toHaveLength(1);
    expect(container?.querySelector('[data-nested-tabs-surface="panel"] path')).not.toBeNull();
    expect(item('Page 2').getAttribute('aria-current')).toBe('page');
  });

  it('refuses three levels', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      act(async () =>
        root?.render(
          <MantineProvider theme={appContentTheme}>
            <NestedTabs activePath={['a']} ariaLabel="Too deep">
              <NestedTabs.Level label="One">
                <NestedTabs.Item as="a" href="#a" path={['a']} label="A" icon={<span>A</span>} />
              </NestedTabs.Level>
              <NestedTabs.Level label="Two">
                <NestedTabs.Item as="a" href="#b" path={['a', 'b']} label="B" icon={<span>B</span>} />
              </NestedTabs.Level>
              <NestedTabs.Level label="Three">
                <NestedTabs.Item as="a" href="#c" path={['a', 'b', 'c']} label="C" icon={<span>C</span>} />
              </NestedTabs.Level>
              <NestedTabs.ContentPanel aria-label="Panel">
                <p>Panel</p>
              </NestedTabs.ContentPanel>
            </NestedTabs>
          </MantineProvider>
        )
      )
    ).rejects.toThrow('accepts one or two NestedTabs.Level children');
    error.mockRestore();
  });
});

function TabsFixture({
  activePath,
  onSelect = () => {},
}: {
  activePath: readonly string[];
  onSelect?: (path: readonly string[]) => void;
}) {
  const tab = (path: readonly string[], label: string) => (
    <NestedTabs.Item
      key={path.join('/')}
      as="button"
      type="button"
      path={path}
      label={label}
      icon={<span>{label.slice(0, 1)}</span>}
      onClick={() => onSelect(path)}
    />
  );
  return (
    <MantineProvider theme={appContentTheme}>
      <NestedTabs activePath={activePath} ariaLabel="Table controls">
        <NestedTabs.Level label="Controls">
          {tab(['hand'], 'Hand')}
          {tab(['log'], 'Log')}
          {tab(['spice'], 'Spice')}
          <NestedTabs.Tools>
            <button type="button">Tool</button>
          </NestedTabs.Tools>
        </NestedTabs.Level>
        <NestedTabs.Level label="Log">
          {tab(['log', 'game'], 'Game')}
          <NestedTabs.Group label="Records">{tab(['log', 'audit'], 'Audit')}</NestedTabs.Group>
        </NestedTabs.Level>
        <NestedTabs.ContentPanel>
          <p>Panel</p>
        </NestedTabs.ContentPanel>
      </NestedTabs>
    </MantineProvider>
  );
}

function tab(label: string) {
  const match = container?.querySelector(`[role="tab"][aria-label="${label}"]`);
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`Missing tab: ${label}`);
  }
  return match;
}

function press(key: string) {
  const target = document.activeElement ?? document.body;
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

describe('NestedTabs with button items', () => {
  const selected: (readonly string[])[] = [];

  beforeEach(async () => {
    selected.length = 0;
    await act(async () =>
      root?.render(<TabsFixture activePath={['log', 'game']} onSelect={(path) => selected.push(path)} />)
    );
  });

  it('turns each level into a named vertical tablist instead of a navigation landmark', () => {
    expect(container?.querySelectorAll('nav')).toHaveLength(0);
    const lists = Array.from(container?.querySelectorAll('[role="tablist"]') ?? []);
    expect(lists.map((list) => list.getAttribute('aria-label'))).toEqual(['Controls', 'Log']);
    expect(lists.every((list) => list.getAttribute('aria-orientation') === 'vertical')).toBe(true);
    /* A tablist owns only tabs: the slots and a group's wrappers step aside, and tools stay outside it. */
    for (const list of lists) {
      const owned = Array.from(list.querySelectorAll('li, ul'));
      expect(owned.every((element) => element.getAttribute('role') === 'none')).toBe(true);
    }
    expect(container?.querySelector('[role="tablist"] button:not([role="tab"])')).toBeNull();
    expect(container?.querySelector('[role="tablist"] [aria-label="Records"]')).toBeNull();
  });

  it('wires selection, the controlled panel and the panel name to the path', () => {
    const panel = container?.querySelector('[role="tabpanel"]');
    expect(panel?.id).toBeTruthy();
    for (const label of ['Hand', 'Log', 'Spice', 'Game', 'Audit']) {
      expect(tab(label).getAttribute('aria-controls')).toBe(panel?.id);
      expect(tab(label).hasAttribute('aria-current')).toBe(false);
    }
    expect(tab('Log').getAttribute('aria-selected')).toBe('true');
    expect(tab('Game').getAttribute('aria-selected')).toBe('true');
    expect(tab('Hand').getAttribute('aria-selected')).toBe('false');
    expect(tab('Audit').getAttribute('aria-selected')).toBe('false');
    expect(tab('Game').dataset.pathState).toBe('active');
    expect(tab('Log').dataset.pathState).toBe('ancestor');
    expect(panel?.getAttribute('aria-labelledby')).toBe(tab('Game').id);
    expect(document.getElementById(tab('Game').id)).toBe(tab('Game'));
  });

  it('keeps one tab stop per level, on its selected tab', () => {
    expect(['Hand', 'Log', 'Spice'].map((label) => tab(label).tabIndex)).toEqual([-1, 0, -1]);
    expect(['Game', 'Audit'].map((label) => tab(label).tabIndex)).toEqual([0, -1]);
  });

  it('falls back to the first tab as the stop while a level has no selected tab', async () => {
    await act(async () => root?.render(<TabsFixture activePath={['elsewhere']} />));
    expect(['Hand', 'Log', 'Spice'].map((label) => tab(label).tabIndex)).toEqual([0, -1, -1]);
  });

  it('moves focus with Up, Down, Home and End, wrapping, without opening a tab', () => {
    tab('Log').focus();
    press('ArrowDown');
    expect(document.activeElement).toBe(tab('Spice'));
    press('ArrowDown');
    expect(document.activeElement).toBe(tab('Hand'));
    press('ArrowUp');
    expect(document.activeElement).toBe(tab('Spice'));
    press('Home');
    expect(document.activeElement).toBe(tab('Hand'));
    press('End');
    expect(document.activeElement).toBe(tab('Spice'));
    /* Left and Right belong to a horizontal list; a vertical rail leaves them alone. */
    press('ArrowRight');
    expect(document.activeElement).toBe(tab('Spice'));
    expect(selected).toEqual([]);
    expect(tab('Log').getAttribute('aria-selected')).toBe('true');
  });

  it('moves within its own level, through groups', () => {
    tab('Game').focus();
    press('ArrowDown');
    expect(document.activeElement).toBe(tab('Audit'));
    press('ArrowDown');
    expect(document.activeElement).toBe(tab('Game'));
  });

  it('opens the focused tab through the button itself', () => {
    tab('Hand').focus();
    act(() => tab('Hand').click());
    expect(selected).toEqual([['hand']]);
  });

  it('keeps link items as navigation when any item is a link', async () => {
    await act(async () => root?.render(<Fixture />));
    expect(container?.querySelector('[role="tablist"], [role="tab"], [role="tabpanel"]')).toBeNull();
    expect(container?.querySelectorAll('nav')).toHaveLength(2);
  });
});
