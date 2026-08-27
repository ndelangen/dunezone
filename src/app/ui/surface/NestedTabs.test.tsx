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
});
