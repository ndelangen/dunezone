/* @vitest-environment jsdom */
import { freshTableState } from '@shared/play/model';
import { draftForGesture } from '@shared/play/tableState';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

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
    canHandleTable: true,
    state: freshTableState(),
    hoveredPieceId: null as string | null,
    deckControls: undefined as ReturnType<Parameters<TableKeyboard['bind']>[0]['read']>['deckControls'],
    finishRotation: vi.fn(),
    flipSelected: vi.fn(),
    /* The cursor is over the table unless a test moves it off. */
    ping: vi.fn(() => true),
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

test('T draws once from the hovered deck and 0 splits ten pieces', () => {
  const { controls } = table();
  const draw = vi.fn();
  controls.deckControls = { draw, shuffle: vi.fn(), recipients: [] };
  controls.hoveredPieceId = 'treachery-deck';
  key('keydown', { key: 't' });
  key('keydown', { key: 't', repeat: true });
  expect(draw).toHaveBeenCalledExactlyOnceWith('treachery-deck');
  key('keydown', { key: '0' });
  vi.advanceTimersByTime(1000);
  expect(controls.splitSelected).toHaveBeenCalledExactlyOnceWith(10, 'treachery-deck');
});

test('T does not draw from a selected deck without hovering or while typing', () => {
  const { controls } = table();
  const draw = vi.fn();
  controls.deckControls = { draw, shuffle: vi.fn(), recipients: [] };
  controls.state = { ...controls.state, selectedPieceId: 'treachery-deck' };
  key('keydown', { key: 't' });
  controls.hoveredPieceId = 'treachery-deck';
  const field = document.body.appendChild(document.createElement('input'));
  key('keydown', { key: 't' }, field);
  key('keydown', { key: 't', ctrlKey: true });
  expect(draw).not.toHaveBeenCalled();
});

test('T adds another card to a carry without drawing into the hand', () => {
  const { controls } = table();
  const draw = vi.fn();
  controls.deckControls = { draw, shuffle: vi.fn(), recipients: [] };
  const deck = controls.state.pieces.find((piece) => piece.id === 'treachery-deck')!;
  controls.state = { ...controls.state, draftMove: draftForGesture(deck, 'top') };
  controls.hoveredPieceId = deck.id;
  key('keydown', { key: 't' });
  key('keydown', { key: 't', repeat: true });
  expect(controls.takeAdditionalFromTarget).toHaveBeenCalledOnce();
  expect(draw).not.toHaveBeenCalled();
});

test.each(['locked', 'inventory', 'non-card', 'read-only'] as const)('T does not draw from a %s target', (reason) => {
  const { controls } = table();
  const draw = vi.fn();
  controls.deckControls = { draw, shuffle: vi.fn(), recipients: [] };
  controls.hoveredPieceId = 'treachery-deck';
  controls.canHandleTable = reason !== 'read-only';
  controls.state = {
    ...controls.state,
    pieces: controls.state.pieces.map((piece) =>
      piece.id === 'treachery-deck'
        ? {
            ...piece,
            locked: reason === 'locked',
            inventory: reason === 'inventory' ? 'shared' : undefined,
            kind: reason === 'non-card' ? 'force' : piece.kind,
          }
        : piece
    ),
  };
  key('keydown', { key: 't' });
  expect(draw).not.toHaveBeenCalled();
});

test('releasing 0 before the hold cancels the ten-piece split', () => {
  const { controls } = table();
  key('keydown', { key: '0' });
  vi.advanceTimersByTime(200);
  key('keyup', { key: '0' });
  vi.advanceTimersByTime(1000);
  expect(controls.splitSelected).not.toHaveBeenCalled();
});

test.each([true, false])('a focused slider keeps its arrow keys with the pointer over the table: %s', (hovered) => {
  const { keyboard } = table();
  keyboard.setPanAvailable(true);
  keyboard.hoverTable(hovered);
  const slider = document.body.appendChild(document.createElement('div'));
  slider.setAttribute('role', 'slider');
  slider.tabIndex = 0;
  slider.focus();
  const changed = vi.fn((event: Event) => event.preventDefault());
  slider.addEventListener('keydown', changed);
  key('keydown', { key: 'ArrowRight', code: 'ArrowRight' }, slider);
  expect(changed).toHaveBeenCalledOnce();
  expect(keyboard.panDirection()).toEqual([0, 0]);
});

test('a focused slider leaves non-arrow shortcuts with the table under the pointer', () => {
  const { keyboard, controls } = table();
  keyboard.setPanAvailable(true);
  keyboard.hoverTable(true);
  const slider = document.body.appendChild(document.createElement('div'));
  slider.setAttribute('role', 'slider');
  slider.tabIndex = 0;
  slider.focus();
  key('keydown', { key: 'q', code: 'KeyQ' }, slider);
  key('keyup', { key: 'q', code: 'KeyQ' }, slider);
  expect(controls.rotateSelected).toHaveBeenCalledWith(-1, 'harkonnen-force-stack');
  key('keydown', { key: 'w', code: 'KeyW' }, slider);
  expect(keyboard.panDirection()).toEqual([0, -1]);
  key('keyup', { key: 'w', code: 'KeyW' }, slider);
  expect(keyboard.panDirection()).toEqual([0, 0]);
  key('keydown', { key: 'Tab', code: 'Tab' }, slider);
  key('keyup', { key: 'Tab', code: 'Tab' }, slider);
  expect(controls.ping).toHaveBeenCalledOnce();
});

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
    keyboard.hoverSpiceBank(true);

    key('keydown', press);
    vi.advanceTimersByTime(1000);
    key('keyup', press);

    expect(controls.spawnSpice.mock.calls).toEqual(spawned === 'one spice' ? [[1]] : []);
    expect(controls.splitSelected).not.toHaveBeenCalled();
  });

  test('0 spawns ten', () => {
    const { keyboard, controls } = table();
    keyboard.hoverSpiceBank(true);
    key('keydown', { key: '0' });
    expect(controls.spawnSpice.mock.calls).toEqual([[10]]);
  });

  test('a focused text field keeps its digits, while a focused button keeps only the table keys', () => {
    const { keyboard, controls } = table();
    const field = document.body.appendChild(document.createElement('input'));
    const button = document.body.appendChild(document.createElement('button'));

    keyboard.hoverSpiceBank(true);
    key('keydown', { key: '2' }, field);
    key('keydown', { key: '3' }, button);
    keyboard.hoverSpiceBank(false);
    key('keydown', { key: '4' }, button);
    vi.advanceTimersByTime(1000);

    expect(controls.spawnSpice.mock.calls).toEqual([[3]]);
    expect(controls.splitSelected).not.toHaveBeenCalled();
  });
});

describe('held keys', () => {
  test('a held Q turns the piece a step on every repeat and sends the turn once, when it comes up', () => {
    const { controls } = table();
    key('keydown', { key: 'q', code: 'KeyQ' });
    key('keydown', { key: 'q', code: 'KeyQ', repeat: true });
    key('keydown', { key: 'q', code: 'KeyQ', repeat: true });
    expect(controls.rotateSelected).toHaveBeenCalledTimes(3);
    expect(controls.finishRotation).not.toHaveBeenCalled();

    key('keyup', { key: 'q', code: 'KeyQ' });
    expect(controls.finishRotation).toHaveBeenCalledTimes(1);
  });

  test('a turn held when the page loses focus goes out then', () => {
    const { controls } = table();
    key('keydown', { key: 'e', code: 'KeyE' });
    window.dispatchEvent(new Event('blur'));
    key('keyup', { key: 'e', code: 'KeyE' });
    expect(controls.finishRotation).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['L', 'l', 'toggleLockSelected'],
    ['G', 'g', 'stackSelected'],
  ] as const)('a held %s acts once', (_name, press, control) => {
    const { controls } = table();
    key('keydown', { key: press });
    key('keydown', { key: press, repeat: true });
    key('keydown', { key: press, repeat: true });
    expect(controls[control]).toHaveBeenCalledTimes(1);
  });
});

describe('focus elsewhere on the page', () => {
  function focusable(html: string) {
    document.body.insertAdjacentHTML('beforeend', html);
    return document.body.lastElementChild!.querySelector('[data-target]') ?? document.body.lastElementChild!;
  }

  test.each([
    ['a link', '<a href="#profile">Profile</a>'],
    ['something inside a link', '<a href="#profile"><span data-target tabindex="-1">Profile</span></a>'],
    [
      'a menu item button',
      '<div role="menu" tabindex="-1"><button data-target role="menuitem">Draw a card</button></div>',
    ],
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

  test.each([
    ['a plain element out of the tab order', '<div tabindex="-1"></div>'],
    ['a focusable region', '<div role="region" tabindex="0" aria-label="Conversation history"></div>'],
    ['an open piece menu', '<div role="menu" tabindex="-1"></div>'],
  ])('%s leaves the table keys working', (_name, html) => {
    const { controls } = table();
    const target = focusable(html);

    key('keydown', { key: 'f' }, target);

    expect(controls.flipSelected.mock.calls).toEqual([['harkonnen-force-stack']]);
  });

  test('the spice disc still answers over a focused link', () => {
    const { keyboard, controls } = table();
    const target = focusable('<a href="#profile">Profile</a>');

    keyboard.hoverSpiceBank(true);
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

  test.each(['keyup', 'blur', 'unbind', 'Cmd'] as const)('a pending draw is cancelled by %s', (cancel) => {
    const { controls, unbind } = table();

    key('keydown', { key: '2' });
    vi.advanceTimersByTime(500);
    controls.hoveredPieceId = 'treachery-deck';

    if (cancel === 'keyup') {
      key('keyup', { key: '2' });
    } else if (cancel === 'blur') {
      window.dispatchEvent(new Event('blur'));
    } else if (cancel === 'Cmd') {
      key('keydown', { key: 'Meta', code: 'MetaLeft', metaKey: true });
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

describe('a carried piece', () => {
  test('F turns it over in hand once per press, and lock, stack and draw keys leave it alone', () => {
    const { controls } = table();
    const draftMove = draftForGesture(
      controls.state.pieces.find((piece) => piece.id === 'harkonnen-force-stack')!,
      'whole'
    );
    controls.state = { ...controls.state, draftMove };

    key('keydown', { key: 'f', code: 'KeyF' });
    key('keydown', { key: 'f', code: 'KeyF', repeat: true });
    key('keydown', { key: 'l', code: 'KeyL' });
    key('keydown', { key: 'g', code: 'KeyG' });
    key('keydown', { key: '2', code: 'Digit2' });
    vi.advanceTimersByTime(1000);

    expect(controls.flipSelected.mock.calls).toEqual([['harkonnen-force-stack']]);
    expect(controls.toggleLockSelected).not.toHaveBeenCalled();
    expect(controls.stackSelected).not.toHaveBeenCalled();
    expect(controls.splitSelected).not.toHaveBeenCalled();
  });
});

describe('a peeked card moved with the arrow keys', () => {
  test('moves the card and leaves the zoomed table where it is', () => {
    const { keyboard } = table();
    keyboard.setPanAvailable(true);
    document.body.innerHTML = '<div role="button" tabindex="0" data-card></div>';
    const card = document.querySelector<HTMLElement>('[data-card]')!;
    card.addEventListener('keydown', (event) => event.preventDefault());

    key('keydown', { key: 'ArrowRight', code: 'ArrowRight' }, card);
    expect(keyboard.panDirection()).toEqual([0, 0]);

    key('keydown', { key: 'ArrowRight', code: 'ArrowRight' });
    expect(keyboard.panDirection()).not.toEqual([0, 0]);
  });
});

describe('the cursor over the table', () => {
  /* A tab list moves its focus on an arrow and claims the key, as the controls panel's tabs do. */
  function focusedTabList() {
    document.body.innerHTML = '<div role="tablist"><button role="tab" data-tab>Hand</button></div>';
    const tab = document.querySelector<HTMLElement>('[data-tab]')!;
    const moved = vi.fn();
    tab.addEventListener('keydown', (event) => {
      if (event.key.startsWith('Arrow')) {
        moved();
        event.preventDefault();
      }
    });
    tab.focus();
    return { tab, moved };
  }

  test('pans with the arrow keys before a focused tab list moves its focus', () => {
    const { keyboard } = table();
    keyboard.setPanAvailable(true);
    keyboard.hoverTable(true);
    const { tab, moved } = focusedTabList();

    key('keydown', { key: 'ArrowRight', code: 'ArrowRight' }, tab);

    expect(moved).not.toHaveBeenCalled();
    expect(keyboard.panDirection()).toEqual([1, 0]);
    key('keyup', { key: 'ArrowRight', code: 'ArrowRight' }, tab);
    expect(keyboard.panDirection()).toEqual([0, 0]);
  });

  test('keeps the arrows from a focused control even without a close look to slide', () => {
    const { keyboard } = table();
    keyboard.hoverTable(true);
    const { tab, moved } = focusedTabList();
    const arrow = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown',
      code: 'ArrowDown',
    });

    tab.dispatchEvent(arrow);

    expect(moved).not.toHaveBeenCalled();
    expect(arrow.defaultPrevented).toBe(true);
    expect(keyboard.panDirection()).toEqual([0, 0]);
  });

  test('answers the piece shortcuts over a focused button', () => {
    const { keyboard, controls } = table();
    keyboard.hoverTable(true);
    const { tab } = focusedTabList();

    key('keydown', { key: 'f' }, tab);

    expect(controls.flipSelected.mock.calls).toEqual([['harkonnen-force-stack']]);
  });

  test('leaves a focused text field its arrows and letters', () => {
    const { keyboard, controls } = table();
    keyboard.setPanAvailable(true);
    keyboard.hoverTable(true);
    const field = document.body.appendChild(document.createElement('input'));
    const heard: string[] = [];
    field.addEventListener('keydown', (event) => heard.push(event.key));
    field.focus();
    const arrow = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowLeft',
      code: 'ArrowLeft',
    });
    const letter = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'f' });

    field.dispatchEvent(arrow);
    field.dispatchEvent(letter);

    expect(heard).toEqual(['ArrowLeft', 'f']);
    expect(arrow.defaultPrevented).toBe(false);
    expect(letter.defaultPrevented).toBe(false);
    expect(keyboard.panDirection()).toEqual([0, 0]);
    expect(controls.flipSelected).not.toHaveBeenCalled();
  });

  test('leaves an open menu under the cursor its arrows', () => {
    const { keyboard } = table();
    keyboard.setPanAvailable(true);
    keyboard.hoverTable(true);
    document.body.innerHTML = '<div role="menu" tabindex="-1" data-menu></div>';
    const menu = document.querySelector<HTMLElement>('[data-menu]')!;
    const stepped = vi.fn();
    menu.addEventListener('keydown', (event) => {
      stepped();
      event.preventDefault();
    });
    menu.focus();

    key('keydown', { key: 'ArrowRight', code: 'ArrowRight' }, menu);

    expect(stepped).toHaveBeenCalled();
    expect(keyboard.panDirection()).toEqual([0, 0]);
  });

  test('leaves a peeked deck under the cursor its arrows, so a focused card moves', () => {
    const { keyboard } = table();
    keyboard.setPanAvailable(true);
    keyboard.hoverTable(true);
    document.body.innerHTML = '<div role="dialog"><div role="button" tabindex="0" data-card></div></div>';
    const card = document.querySelector<HTMLElement>('[data-card]')!;
    const moved = vi.fn();
    card.addEventListener('keydown', (event) => {
      moved();
      event.preventDefault();
    });
    card.focus();
    const heardAbove = vi.fn();
    document.addEventListener('keydown', heardAbove);

    key('keydown', { key: 'ArrowLeft', code: 'ArrowLeft' }, card);
    document.removeEventListener('keydown', heardAbove);

    expect(moved).toHaveBeenCalled();
    expect(heardAbove).toHaveBeenCalled();
  });

  test('off the table, the focused tab list keeps its arrows again', () => {
    const { keyboard } = table();
    keyboard.setPanAvailable(true);
    keyboard.hoverTable(true);
    keyboard.hoverTable(false);
    const { tab, moved } = focusedTabList();

    key('keydown', { key: 'ArrowRight', code: 'ArrowRight' }, tab);

    expect(moved).toHaveBeenCalled();
    expect(keyboard.panDirection()).toEqual([0, 0]);
  });
});

describe('a held pan key', () => {
  test('stops panning when its physical key comes up, whatever it types by then', () => {
    const { keyboard } = table();
    keyboard.setPanAvailable(true);
    key('keydown', { key: 'w', code: 'KeyW' });
    expect(keyboard.panDirection()).toEqual([0, -1]);
    /* macOS: Option held after W makes the same key come up as "∑". */
    key('keyup', { key: '∑', code: 'KeyW', altKey: true });
    expect(keyboard.panDirection()).toEqual([0, 0]);
  });

  /* macOS sends no keyup for a key let go while Cmd is down, so the pan would otherwise keep sliding. */
  test('stops panning when Cmd goes down', () => {
    const { keyboard } = table();
    keyboard.setPanAvailable(true);
    key('keydown', { key: 'd', code: 'KeyD' });
    expect(keyboard.panDirection()).toEqual([1, 0]);
    key('keydown', { key: 'Meta', code: 'MetaLeft', metaKey: true });
    expect(keyboard.panDirection()).toEqual([0, 0]);
  });

  test('pans by what the key types, so a layout where Z sits on KeyW still pans with its own W', () => {
    const { keyboard } = table();
    keyboard.setPanAvailable(true);
    key('keydown', { key: 'w', code: 'KeyZ' });
    expect(keyboard.panDirection()).toEqual([0, -1]);
    key('keyup', { key: 'w', code: 'KeyZ' });
    expect(keyboard.panDirection()).toEqual([0, 0]);
  });
});

describe('Tab pings', () => {
  function tab(type: 'keydown' | 'keyup', init: KeyboardEventInit = {}, target: EventTarget = window) {
    const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: 'Tab', code: 'Tab', ...init });
    target.dispatchEvent(event);
    return event;
  }

  test('once per press, holding the focus where it is while the key is down', () => {
    const { controls } = table();

    expect(tab('keydown').defaultPrevented).toBe(true);
    expect(tab('keydown', { repeat: true }).defaultPrevented).toBe(true);
    tab('keyup');
    tab('keydown');

    expect(controls.ping).toHaveBeenCalledTimes(2);
  });

  test('moves the focus as usual while the cursor is off the table', () => {
    const { controls } = table();
    controls.ping.mockReturnValue(false);

    expect(tab('keydown').defaultPrevented).toBe(false);
    expect(tab('keydown', { repeat: true }).defaultPrevented).toBe(false);
    expect(controls.ping).toHaveBeenCalledTimes(1);
  });

  test('a Tab let go while the page had no focus does not hold back the next one off the table', () => {
    const { controls } = table();

    tab('keydown');
    window.dispatchEvent(new Event('blur'));
    controls.ping.mockReturnValue(false);

    expect(tab('keydown').defaultPrevented).toBe(false);
    expect(tab('keydown', { repeat: true }).defaultPrevented).toBe(false);
  });

  test('leaves Shift+Tab and a focused text field their own Tab', () => {
    const { controls } = table();
    const field = document.body.appendChild(document.createElement('textarea'));

    expect(tab('keydown', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(tab('keydown', {}, field).defaultPrevented).toBe(false);
    expect(controls.ping).not.toHaveBeenCalled();
  });

  test('held for three seconds pings once more, with the rumble', () => {
    const { controls } = table();

    tab('keydown');
    vi.advanceTimersByTime(2999);
    expect(controls.ping.mock.calls).toEqual([[]]);
    vi.advanceTimersByTime(1);
    vi.advanceTimersByTime(5000);
    expect(controls.ping.mock.calls).toEqual([[], ['fart']]);
  });

  test('let go, or the page left, before three seconds, rumbles nothing', () => {
    const { controls } = table();

    tab('keydown');
    vi.advanceTimersByTime(2000);
    tab('keyup');
    tab('keydown');
    vi.advanceTimersByTime(2000);
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(5000);

    expect(controls.ping.mock.calls).toEqual([[], []]);
  });

  test('Cmd pressed during the hold rumbles nothing, as macOS may never send the Tab keyup', () => {
    const { controls } = table();

    tab('keydown');
    vi.advanceTimersByTime(1000);
    key('keydown', { key: 'Meta', code: 'MetaLeft', metaKey: true });
    vi.advanceTimersByTime(5000);

    expect(controls.ping.mock.calls).toEqual([[]]);
  });

  test('Shift going down, or a text field taking the focus, lets a held rumble go before Tab repeats', () => {
    const { controls } = table();
    const field = document.body.appendChild(document.createElement('textarea'));

    tab('keydown');
    vi.advanceTimersByTime(1000);
    key('keydown', { key: 'Shift', code: 'ShiftLeft', shiftKey: true });
    vi.advanceTimersByTime(5000);
    tab('keydown');
    vi.advanceTimersByTime(1000);
    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.advanceTimersByTime(5000);

    expect(controls.ping.mock.calls).toEqual([[], []]);
    field.remove();
  });

  test('Shift pressed during the hold, or a text field taking the focus, rumbles nothing', () => {
    const { controls } = table();
    const field = document.body.appendChild(document.createElement('textarea'));

    tab('keydown');
    vi.advanceTimersByTime(1000);
    tab('keydown', { repeat: true, shiftKey: true });
    vi.advanceTimersByTime(5000);
    tab('keydown');
    vi.advanceTimersByTime(1000);
    tab('keydown', { repeat: true }, field);
    vi.advanceTimersByTime(5000);

    expect(controls.ping.mock.calls).toEqual([[], []]);
  });

  test('a press off the table never rumbles', () => {
    const { controls } = table();
    controls.ping.mockReturnValue(false);

    tab('keydown');
    vi.advanceTimersByTime(5000);

    expect(controls.ping).toHaveBeenCalledTimes(1);
  });

  test('pings over a button clicked a moment ago, which keeps the focus', () => {
    const { controls } = table();
    const button = document.body.appendChild(document.createElement('button'));

    expect(tab('keydown', {}, button).defaultPrevented).toBe(true);
    expect(controls.ping).toHaveBeenCalledTimes(1);
  });
});
