/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { RadialMenu } from './RadialMenu';

afterEach(async () => {
  cleanup();
  await Promise.resolve();
  /* Each unmounted ring leaves a closing copy for a moment; the next test starts without them. */
  for (const copy of document.querySelectorAll('[data-closing]')) {
    copy.remove();
  }
});

function deckMenu(onClose = vi.fn(), recipients = ['Atreides', 'Fremen']) {
  render(
    <RadialMenu
      name="Deck actions"
      hub="12 cards"
      x={400}
      y={300}
      onClose={onClose}
      actions={[
        { key: 'draw', label: 'Draw a card', icon: 'draw', onSelect: vi.fn() },
        {
          key: 'deal',
          label: 'Deal a card',
          icon: 'deal',
          targets: recipients.map((name) => ({
            key: name,
            label: `Deal 1 to ${name}`,
            name,
            face: name.slice(0, 2),
            onSelect: vi.fn(),
          })),
        },
      ]}
    />
  );
  return screen.getByRole('menu', { name: 'Deck actions' });
}

test('hovering Deal leaves the action ring open until it is clicked', async () => {
  vi.useFakeTimers();
  try {
    deckMenu();
    const deal = screen.getByRole('menuitem', { name: 'Deal a card' });
    const move = new MouseEvent('pointermove', { bubbles: true });
    Object.defineProperty(move, 'movementX', { value: 1 });
    fireEvent(deal, move);
    await act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('menuitem', { name: 'Deal 1 to Fremen' })).toBeNull();
    fireEvent.click(deal);
    expect(screen.getByRole('menuitem', { name: 'Deal 1 to Fremen' })).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

test('stepping into Deal from the keyboard keeps focus on the ring, so arrows and Escape still work', () => {
  const onClose = vi.fn();
  const menu = deckMenu(onClose);
  const deal = screen.getByRole('menuitem', { name: 'Deal a card' });
  deal.focus();
  fireEvent.click(deal);

  expect(document.activeElement).toBe(menu);
  fireEvent.keyDown(menu, { key: 'ArrowRight' });
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Back');

  fireEvent.keyDown(menu, { key: 'Escape' });
  expect(screen.queryByRole('menuitem', { name: 'Deal 1 to Fremen' })).toBeNull();
  expect(document.activeElement).toBe(menu);
  expect(onClose).not.toHaveBeenCalled();
});

test('the first arrow back from the ring lands on the last item, and Tab closes the ring', () => {
  const onClose = vi.fn();
  const menu = deckMenu(onClose);
  fireEvent.keyDown(menu, { key: 'ArrowLeft' });
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Deal a card');

  fireEvent.keyDown(menu, { key: 'Tab' });
  expect(onClose).toHaveBeenCalledOnce();
});

test('focus moving on to something outside the ring closes it, but moving between its items does not', () => {
  const onClose = vi.fn();
  const menu = deckMenu(onClose);
  const outside = document.body.appendChild(document.createElement('input'));
  const draw = screen.getByRole('menuitem', { name: 'Draw a card' });
  draw.focus();
  fireEvent.click(draw);
  screen.getByRole('menuitem', { name: 'Deal a card' }).focus();
  expect(onClose).not.toHaveBeenCalled();
  expect(menu).toBeTruthy();
  outside.focus();
  expect(onClose).toHaveBeenCalledOnce();
  outside.remove();
});

test('closing hands focus back to what held it before the ring opened', () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  deckMenu();
  expect(document.activeElement).not.toBe(opener);

  cleanup();
  expect(document.activeElement).toBe(opener);
  opener.remove();
});

test('a window narrower than the ring centres it rather than push it off one side', () => {
  vi.stubGlobal('innerWidth', 320);
  try {
    const menu = deckMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Deal a card' }));
    expect(menu.style.left).toBe('160px');
  } finally {
    vi.unstubAllGlobals();
  }
});

test('a caption with no room beside the ring stays inside a short window', () => {
  vi.stubGlobal('innerWidth', 568);
  vi.stubGlobal('innerHeight', 320);
  try {
    deckMenu(
      vi.fn(),
      Array.from({ length: 18 }, (_, index) => `Faction ${index + 1}`)
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Deal a card' }));
    /* Stepping in captions the ring with the action's label. */
    const caption = [...document.querySelectorAll<HTMLElement>('[role="menu"] span')].find(
      (element) => element.style.top !== ''
    );
    expect(caption?.textContent).toContain('Deal a card');
    expect(160 + Number.parseFloat(caption!.style.top) + 64).toBeLessThanOrEqual(320);
  } finally {
    vi.unstubAllGlobals();
  }
});

test('closing removes the menu at once and leaves only a lifeless copy to play the close', async () => {
  vi.useFakeTimers();
  try {
    const { unmount } = render(
      <RadialMenu name="Deck actions" hub="12 cards" x={400} y={300} onClose={vi.fn()} actions={[]} />
    );
    unmount();
    await act(async () => {});
    expect(document.querySelectorAll('[data-closing]')).toHaveLength(1);
    expect(screen.queryByRole('menu')).toBeNull();
    const copy = document.querySelector<HTMLElement>('[data-closing]');
    expect(copy?.getAttribute('aria-hidden')).toBe('true');
    expect(copy?.querySelector('[role], [id]')).toBeNull();
    expect(copy?.hasAttribute('aria-labelledby')).toBe(false);
    vi.advanceTimersByTime(300);
    expect(document.querySelector('[data-closing]')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test('a closing ring leaves no native controls in the sequential tab order', async () => {
  vi.useFakeTimers();
  try {
    deckMenu();
    cleanup();
    await act(async () => {});
    const copy = document.querySelector<HTMLElement>('[data-closing]')!;
    const controls = [...copy.querySelectorAll<HTMLButtonElement>('button')];
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((control) => control.tabIndex < 0)).toBe(true);
    vi.runAllTimers();
  } finally {
    vi.useRealTimers();
  }
});

test("React's strict remount leaves no closing copy behind", async () => {
  render(
    <StrictMode>
      <RadialMenu name="Deck actions" hub="12 cards" x={400} y={300} onClose={vi.fn()} actions={[]} />
    </StrictMode>
  );
  await act(async () => {});
  expect(document.querySelector('[data-closing]')).toBeNull();
  expect(screen.getByRole('menu', { name: 'Deck actions' })).toBeTruthy();
});

test('the closing copy keeps the ids inside artwork, so a token face still finds its gradients while it closes', async () => {
  const face = (
    <svg viewBox="0 0 10 10">
      <defs>
        <linearGradient id="fremen-sand" />
      </defs>
      <rect width="10" height="10" fill="url(#fremen-sand)" />
    </svg>
  );
  const { unmount } = render(
    <RadialMenu
      name="Deck actions"
      hub="12 cards"
      x={400}
      y={300}
      onClose={vi.fn()}
      actions={[
        {
          key: 'deal',
          label: 'Deal a card',
          icon: 'deal',
          targets: [{ key: 'fremen', label: 'Deal 1 to Fremen', name: 'Fremen', face, onSelect: vi.fn() }],
        },
      ]}
    />
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Deal a card' }));
  unmount();
  await act(async () => {});
  const copy = document.querySelector<HTMLElement>('[data-closing]');
  expect(copy?.querySelector('linearGradient')?.id).toBe('fremen-sand');
  expect(copy?.querySelector('[role]')).toBeNull();
});
