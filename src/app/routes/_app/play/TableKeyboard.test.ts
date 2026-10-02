/* @vitest-environment jsdom */
import { freshTableState } from '@shared/play/model';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { TableKeyboard } from './TableKeyboard';

const unbinds: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const unbind of unbinds.splice(0)) {
    unbind();
  }
  document.body.replaceChildren();
  vi.useRealTimers();
});

/* A bound keyboard over stub controls; the fresh table selects the Harkonnen stack, so a stray draw has a target. */
function table() {
  const keyboard = new TableKeyboard();
  const controls = {
    canInteract: true,
    state: freshTableState(),
    hoveredPieceId: null as string | null,
    deckControls: undefined,
    flipSelected: vi.fn(),
    rotateSelected: vi.fn(),
    spawnSpice: vi.fn(),
    splitSelected: vi.fn(),
    stackSelected: vi.fn(),
    takeAdditionalFromTarget: vi.fn(),
    toggleLockSelected: vi.fn(),
  };
  unbinds.push(keyboard.bind({ events: window, read: () => controls }));
  return { keyboard, controls, unbind: unbinds.at(-1)! };
}

function key(type: 'keydown' | 'keyup', init: KeyboardEventInit, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }));
}

describe('over the hovered spice disc', () => {
  /* Each press as its layout reports it, held for a second, so a press that armed the draw would take from the selected stack. */
  test.each([
    ['QWERTY 1', 'one spice', { key: '1', code: 'Digit1' }],
    ['QWERTY Shift+1, which types !,', 'nothing', { key: '!', code: 'Digit1', shiftKey: true }],
    ['AZERTY Shift+&, which types 1,', 'one spice', { key: '1', code: 'Digit1', shiftKey: true }],
    ['AZERTY &', 'nothing', { key: '&', code: 'Digit1' }],
    ['keypad 1', 'one spice', { key: '1', code: 'Numpad1' }],
  ] as const)('%s spawns %s and draws nothing', (_name, spawned, press) => {
    const { keyboard, controls } = table();
    keyboard.hoverSupply(true);

    key('keydown', press);
    vi.advanceTimersByTime(1000);
    key('keyup', press);

    expect(controls.spawnSpice.mock.calls).toEqual(spawned === 'one spice' ? [[1]] : []);
    expect(controls.splitSelected).not.toHaveBeenCalled();
  });

  test('0 spawns ten', () => {
    const { keyboard, controls } = table();
    keyboard.hoverSupply(true);
    key('keydown', { key: '0' });
    expect(controls.spawnSpice.mock.calls).toEqual([[10]]);
  });

  test('a focused text field keeps its digits, while a focused button keeps only the table keys', () => {
    const { keyboard, controls } = table();
    const field = document.body.appendChild(document.createElement('input'));
    const button = document.body.appendChild(document.createElement('button'));

    keyboard.hoverSupply(true);
    key('keydown', { key: '2' }, field);
    key('keydown', { key: '3' }, button);
    keyboard.hoverSupply(false);
    key('keydown', { key: '4' }, button);
    vi.advanceTimersByTime(1000);

    expect(controls.spawnSpice.mock.calls).toEqual([[3]]);
    expect(controls.splitSelected).not.toHaveBeenCalled();
  });
});

describe('focus elsewhere on the page', () => {
  function focusable(html: string) {
    document.body.insertAdjacentHTML('beforeend', html);
    return document.body.lastElementChild!.querySelector('[data-target]') ?? document.body.lastElementChild!;
  }

  test.each([
    ['a link', '<a href="#profile">Profile</a>'],
    ['a focusable region', '<div role="log" tabindex="0" aria-label="Conversation history"></div>'],
    ['an open menu', '<div role="menu" tabindex="-1"><button data-target role="menuitem">Draw a card</button></div>'],
    ['an open menu itself', '<div role="menu" tabindex="-1"></div>'],
    ['a menu item inside an open menu', '<div role="menu"><div data-target role="presentation"></div></div>'],
  ])('%s keeps the table keys', (_name, html) => {
    const { controls } = table();
    const target = focusable(html);

    for (const press of ['f', 'l', 'g', 'q', 'e', '2']) {
      key('keydown', { key: press }, target);
    }
    vi.advanceTimersByTime(1000);

    expect(controls.flipSelected).not.toHaveBeenCalled();
    expect(controls.toggleLockSelected).not.toHaveBeenCalled();
    expect(controls.stackSelected).not.toHaveBeenCalled();
    expect(controls.rotateSelected).not.toHaveBeenCalled();
    expect(controls.splitSelected).not.toHaveBeenCalled();
  });

  test('a plain element out of the tab order leaves the table keys working', () => {
    const { controls } = table();
    const target = focusable('<div tabindex="-1"></div>');

    key('keydown', { key: 'f' }, target);

    expect(controls.flipSelected.mock.calls).toEqual([['harkonnen-force-stack']]);
  });

  test('the spice disc still answers over a focused link', () => {
    const { keyboard, controls } = table();
    const target = focusable('<a href="#profile">Profile</a>');

    keyboard.hoverSupply(true);
    key('keydown', { key: '5' }, target);

    expect(controls.spawnSpice.mock.calls).toEqual([[5]]);
  });
});

describe('number-key stack draws', () => {
  test('hold the original target across hover and state changes and draw only once', () => {
    const { controls } = table();

    key('keydown', { key: '2' });
    vi.advanceTimersByTime(400);
    controls.hoveredPieceId = 'treachery-deck';
    controls.state = { ...controls.state, stormSectorIndex: controls.state.stormSectorIndex + 1 };
    vi.advanceTimersByTime(200);
    key('keyup', { key: '3' });
    key('keydown', { key: '2', repeat: true });
    vi.advanceTimersByTime(399);
    expect(controls.splitSelected).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(controls.splitSelected.mock.calls).toEqual([[2, 'harkonnen-force-stack']]);

    key('keydown', { key: '2', repeat: true });
    vi.advanceTimersByTime(1000);
    key('keyup', { key: '2' });
    expect(controls.splitSelected).toHaveBeenCalledTimes(1);
  });

  test.each(['keyup', 'blur', 'unbind'] as const)('a pending draw is cancelled by %s', (cancel) => {
    const { controls, unbind } = table();

    key('keydown', { key: '2' });
    vi.advanceTimersByTime(500);
    controls.hoveredPieceId = 'treachery-deck';

    if (cancel === 'keyup') {
      key('keyup', { key: '2' });
    } else if (cancel === 'blur') {
      window.dispatchEvent(new Event('blur'));
    } else {
      unbind();
    }
    /* Read before the clock moves: an unbound keyboard's leftover timer fires without a table to draw from, so only the count shows it. */
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(1000);
    expect(controls.splitSelected).not.toHaveBeenCalled();
  });

  /* #1507: on AZERTY, Shift+& types 1, and with Shift let go first the same key comes up as "&". */
  test('a pending draw is cancelled by its own key coming up, even when it no longer types the digit', () => {
    const { controls } = table();

    key('keydown', { key: '1', code: 'Digit1', shiftKey: true });
    vi.advanceTimersByTime(500);
    key('keyup', { key: 'Shift', code: 'ShiftLeft' });
    key('keyup', { key: '&', code: 'Digit1' });

    vi.advanceTimersByTime(1000);
    expect(controls.splitSelected).not.toHaveBeenCalled();
  });

  test('another key coming up leaves the pending draw running', () => {
    const { controls } = table();

    key('keydown', { key: '1', code: 'Digit1', shiftKey: true });
    key('keyup', { key: 'é', code: 'Digit2' });

    vi.advanceTimersByTime(1000);
    expect(controls.splitSelected.mock.calls).toEqual([[1, 'harkonnen-force-stack']]);
  });
});
