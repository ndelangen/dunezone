// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { stubTooltipDom, tooltipTestTheme } from '@ui/tooltip.test.fixture';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { FactionHeadingHints } from './FactionHeadingHints';

const roots: HTMLElement[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  stubTooltipDom();
});

afterEach(() => {
  cleanup();
  for (const root of roots.splice(0)) {
    root.remove();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeHeading(name = 'House Atreides', tabIndex?: string) {
  const heading = document.createElement('h2');
  heading.textContent = 'Advantages';
  heading.dataset.factionName = name;
  heading.dataset.rulebookBlockId = 'HEAD';
  if (tabIndex !== undefined) {
    heading.setAttribute('tabindex', tabIndex);
  }
  return heading;
}

function mountHints(tabIndex?: string) {
  const heading = makeHeading('House Atreides', tabIndex);
  const root = document.createElement('div');
  root.append(heading);
  document.body.append(root);
  roots.push(root);
  const reference = { current: root };
  const view = (content: unknown) => (
    <MantineProvider theme={tooltipTestTheme} forceColorScheme="dark">
      <FactionHeadingHints root={reference} content={content} />
    </MantineProvider>
  );
  const result = render(view('first'));
  return { ...result, root, heading, view };
}

async function settle() {
  await act(() => vi.runOnlyPendingTimersAsync());
}

async function focusHoveredHeading() {
  const { heading } = mountHints();
  fireEvent.mouseEnter(heading);
  await settle();
  act(() => heading.focus());
  await settle();
  return heading;
}

test('frozen heading hints support hover, keyboard focus, Escape and a fresh hover', async () => {
  const { heading } = mountHints();
  expect(heading.getAttribute('tabindex')).toBe('0');
  fireEvent.mouseEnter(heading);
  await settle();
  expect(screen.getByRole('tooltip').textContent).toBe('House Atreides');
  fireEvent.mouseLeave(heading);
  await settle();
  expect(screen.queryByRole('tooltip')).toBeNull();

  act(() => heading.focus());
  await settle();
  expect(screen.getByRole('tooltip').textContent).toBe('House Atreides');
  fireEvent.keyDown(heading, { key: 'Escape' });
  await settle();
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(document.activeElement).toBe(heading);
  act(() => heading.blur());
  fireEvent.mouseLeave(heading);
  fireEvent.mouseEnter(heading);
  await settle();
  expect(screen.getByRole('tooltip').textContent).toBe('House Atreides');
});

test('Escape keeps a hovered hint dismissed when keyboard focus moves away', async () => {
  const heading = await focusHoveredHeading();
  fireEvent.keyDown(heading, { key: 'Escape' });
  await settle();
  expect(screen.queryByRole('tooltip')).toBeNull();

  act(() => heading.blur());
  await settle();
  expect(screen.queryByRole('tooltip')).toBeNull();

  fireEvent.mouseLeave(heading);
  await settle();
  fireEvent.mouseEnter(heading);
  await settle();
  expect(screen.getByRole('tooltip').textContent).toBe('House Atreides');
});

test('leaving a dismissed focused heading allows a fresh hover after blur', async () => {
  const heading = await focusHoveredHeading();
  fireEvent.keyDown(heading, { key: 'Escape' });
  fireEvent.mouseLeave(heading);
  await settle();
  act(() => heading.blur());
  await settle();
  expect(screen.queryByRole('tooltip')).toBeNull();

  fireEvent.mouseEnter(heading);
  await settle();
  expect(screen.getByRole('tooltip').textContent).toBe('House Atreides');
});

test('a fresh hover reopens a dismissed hint while its heading keeps keyboard focus', async () => {
  const heading = await focusHoveredHeading();
  fireEvent.keyDown(heading, { key: 'Escape' });
  fireEvent.mouseLeave(heading);
  await settle();
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(document.activeElement).toBe(heading);

  fireEvent.mouseEnter(heading);
  await settle();
  expect(screen.getByRole('tooltip').textContent).toBe('House Atreides');
});

test.each([undefined, '-1', '3'])('unmount restores the original tabindex %s', (tabIndex) => {
  const { heading, unmount } = mountHints(tabIndex);
  unmount();
  expect(heading.getAttribute('tabindex')).toBe(tabIndex ?? null);
});

test('a publication replacement releases the old target and binds the new heading', async () => {
  const { root, heading, rerender, view } = mountHints('-1');
  const next = makeHeading('Spacing Guild');
  root.replaceChildren(next);
  rerender(view('next'));
  expect(heading.getAttribute('tabindex')).toBe('-1');
  expect(next.getAttribute('tabindex')).toBe('0');
  act(() => next.focus());
  await settle();
  expect(screen.getByRole('tooltip').textContent).toBe('Spacing Guild');
});

test('unmount removes the listeners attached to a frozen heading', () => {
  const { heading, unmount } = mountHints();
  unmount();
  const added = vi.spyOn(heading, 'addEventListener');
  const removed = vi.spyOn(heading, 'removeEventListener');
  const { unmount: release } = render(
    <MantineProvider theme={tooltipTestTheme}>
      <FactionHeadingHints root={{ current: heading.parentElement as HTMLDivElement }} content="listeners" />
    </MantineProvider>
  );
  expect(added.mock.calls.length).toBeGreaterThan(0);
  release();
  for (const [type, listener] of added.mock.calls) {
    expect(
      removed.mock.calls.some(([removedType, removedListener]) => removedType === type && removedListener === listener)
    ).toBe(true);
  }
});
