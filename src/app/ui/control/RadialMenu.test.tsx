/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { RadialMenu } from './RadialMenu';

afterEach(cleanup);

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
