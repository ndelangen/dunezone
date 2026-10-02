import preview from '@sb/preview';
import { TABLE_PHASES } from '@shared/play/phases';
import { spiceSupplySlot } from '@shared/play/spiceSupply';
import { BOARD_RADIUS, BOARD_SURFACE_Y, stackTopHeight } from '@shared/play/tableGeometry';
import { TRACKER_DISC_TOP_Y } from '@shared/play/tableTrackers';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { mapViewPoint, openTab } from './playing.stories.fixture';
import { factions, playingSnapshot, productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Playing',
});
async function tablePage(canvasElement: HTMLElement, phaseLabel: string = TABLE_PHASES[0].label) {
  const page = within(canvasElement.ownerDocument.body);
  const viewControls = await page.findByRole('group', { name: 'Table view' }, { timeout: 30_000 });
  const document = canvasElement.ownerDocument;
  await waitFor(
    () => {
      expect(viewControls).toBeVisible();
      const canvas = document.querySelector('.dune-play-shell canvas');
      expect(canvas).toBeVisible();
      expect(canvas?.getBoundingClientRect().height).toBeGreaterThan(100);
      expect(document.querySelector('[data-piece-id="treachery-deck"]')).toHaveTextContent('10');
      expect(
        Array.from(document.fonts).some(
          (font) => font.family.replaceAll('"', '') === 'Dune Play Table Label' && font.status === 'loaded'
        )
      ).toBe(true);
    },
    { timeout: 30_000 }
  );
  const shell = document.querySelector<HTMLElement>('.dune-play-shell');
  if (!shell) {
    throw new Error('The Play route did not mount its table.');
  }
  expect(document.querySelector('[data-page-layout-height="fullscreen"]')).not.toBeNull();
  const header = shell.querySelector('header');
  if (!header) {
    throw new Error('The table header is missing.');
  }
  expect(within(header).getByRole('img', { name: 'Dune' })).toBeVisible();
  expect(within(header).getByText(phaseLabel)).toBeVisible();
  expect(within(header).queryByText(/^Phase \d+ of \d+$/)).toBeNull();
  expect(within(header).queryByText(/^(Center|Help|Setup|Lobby)$/)).toBeNull();
  expect(page.queryByRole('link', { name: /^(Dune )?Play$/ })).toBeNull();
  return { page, shell, document };
}

/* The shell opens through an iris once the renderer is ready; until then it stays closed behind the stage's status line. */
export const OpensThroughAnIris = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { shell, document } = await tablePage(canvasElement);
    const view = document.defaultView!;
    /* The runner's headless renderer may never report; the stage then opens on the fallback clock. */
    await waitFor(() => expect(shell.parentElement).toHaveAttribute('data-scene-ready', 'true'), { timeout: 5000 });
    expect(view.getComputedStyle(shell).animationName).toBe('dune-play-enter');
    expect(within(document.body).queryByText('Opening the table...')).toBeNull();
  },
});

/*
 * The motion verdict keeps the shell open and still, before and after the renderer is ready.
 * It also stills the shell's transitions and smooth scrolling, whatever the OS hint says.
 */
export const OpensStill = meta.story({
  beforeEach: install(() => productTransport()),
  globals: { motion: 'reduce' },
  play: async ({ canvasElement }) => {
    const { shell, document } = await tablePage(canvasElement);
    const view = document.defaultView!;
    const picker = within(shell).getByRole('group', { name: 'Table view' });
    for (const element of [shell, within(picker).getAllByRole('button')[0]!]) {
      expect(Number.parseFloat(view.getComputedStyle(element).transitionDuration)).toBeLessThan(0.001);
      expect(view.getComputedStyle(element).scrollBehavior).toBe('auto');
    }
    expect(view.getComputedStyle(shell).clipPath).toBe('none');
    await waitFor(() => expect(shell.parentElement).toHaveAttribute('data-scene-ready', 'true'), { timeout: 5000 });
    expect(view.getComputedStyle(shell).animationName).toBe('none');
    expect(view.getComputedStyle(shell).clipPath).toBe('none');
  },
});

export const TableControls = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, shell, document } = await tablePage(canvasElement);
    const viewButtons = within(page.getByRole('group', { name: 'Table view' }));

    for (const view of ['left', 'right', 'bottom', 'map']) {
      const button = viewButtons.getByRole('button', { name: new RegExp(`^Focus on ${view}`) });
      await userEvent.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(shell).toHaveAttribute('data-table-view', view);
    }

    /* The header's controls lead the Tab order: Tab from the page start reaches the header before the separator. */
    const divider = page.getByRole('separator', { name: 'Resize controls panel' });
    const header = shell.querySelector('header')!;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    let focused: Element | null = null;
    for (let press = 0; press < 50 && focused !== divider && !header.contains(focused); press++) {
      await userEvent.tab();
      focused = document.activeElement;
    }
    expect(header.contains(focused), `Tab reaches ${focused?.outerHTML.slice(0, 80)} first`).toBe(true);

    divider.focus();
    await userEvent.keyboard('{Home}');
    expect(divider.getAttribute('aria-valuenow')).toBe(divider.getAttribute('aria-valuemin'));
    const minimum = Number(divider.getAttribute('aria-valuenow'));
    await userEvent.keyboard('{ArrowUp}');
    expect(Number(divider.getAttribute('aria-valuenow'))).toBeGreaterThan(minimum);
    await userEvent.keyboard('{End}');
    expect(divider.getAttribute('aria-valuenow')).toBe(divider.getAttribute('aria-valuemax'));
    await userEvent.tab();

    const counters = Array.from(shell.querySelectorAll<HTMLElement>('.scene-piece-count'));
    expect(counters.length).toBeGreaterThan(0);
    for (const counter of counters) {
      expect(counter).not.toBeVisible();
    }
    await userEvent.keyboard('{Alt>}');
    expect(shell).toHaveAttribute('data-show-counts', 'true');
    for (const counter of counters) {
      expect(counter).toBeVisible();
    }
    window.dispatchEvent(new Event('blur'));
    await waitFor(() => expect(shell).toHaveAttribute('data-show-counts', 'false'));
    for (const counter of counters) {
      expect(counter).not.toBeVisible();
    }
    await userEvent.keyboard('{/Alt}');
  },
});

/* Holding Control names every piece and its owning faction; a shared piece shows its name alone, and letting go clears the names. */
export const PieceNames = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { shell, document } = await tablePage(canvasElement);
    /* One keyboard, so a key pressed while another is held carries both modifiers. */
    const user = userEvent.setup();
    const nameOf = (pieceId: string) => {
      const name = document
        .querySelector(`[data-piece-id="${pieceId}"]`)
        ?.parentElement?.querySelector('.scene-piece-name');
      if (!(name instanceof HTMLElement)) {
        throw new Error(`${pieceId} carries no name.`);
      }
      return name;
    };
    const troopId = 'starting-0-arrakeen';
    const troop = playingSnapshot().table.pieces.find((entry) => entry.id === troopId)!;
    const troopName = nameOf(troopId);
    const deckName = nameOf('treachery-deck');
    const counters = Array.from(shell.querySelectorAll<HTMLElement>('.scene-piece-count'));

    expect(troopName).not.toBeVisible();
    await user.keyboard('{Control>}');
    expect(shell).toHaveAttribute('data-show-names', 'true');
    expect(shell).toHaveAttribute('data-show-counts', 'false');
    expect(troopName).toBeVisible();
    expect(within(troopName).getByText(troop.label)).toBeVisible();
    expect(within(troopName).getByText(factions[0]!.data.name)).toBeVisible();
    expect(deckName).toBeVisible();
    expect(deckName.querySelector('.scene-piece-name__owner')).toBeNull();
    /* Control shows names only: the counts wait for Alt, and holding both shows both. */
    for (const counter of counters) {
      expect(counter).not.toBeVisible();
    }
    await user.keyboard('{Alt>}');
    expect(shell).toHaveAttribute('data-show-counts', 'true');
    expect(troopName).toBeVisible();
    expect(counters[0]).toBeVisible();
    await user.keyboard('{/Alt}');
    expect(counters[0]).not.toBeVisible();
    expect(troopName).toBeVisible();

    await user.keyboard('{/Control}');
    expect(shell).toHaveAttribute('data-show-names', 'false');
    expect(troopName).not.toBeVisible();
    expect(deckName).not.toBeVisible();
  },
});

/* The wheel over the board tilts the camera toward top-down and back; Ctrl with the wheel stays the browser's zoom. */
export const WheelTiltsTheCamera = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { shell, document } = await tablePage(canvasElement);
    const canvas = shell.querySelector('canvas')!;
    /* The deck's tag follows the camera, so its placement shows where the camera stands. */
    const deckPlacement = () =>
      document.querySelector('[data-piece-id="treachery-deck"]')?.closest('div')?.parentElement?.style.transform;
    const turnWheel = (deltaY: number, ctrlKey = false) => {
      const event = new WheelEvent('wheel', { deltaY, ctrlKey, bubbles: true, cancelable: true });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const approved = deckPlacement();
    expect(approved).toBeTruthy();

    expect(turnWheel(600, true)).toBe(false);
    expect(turnWheel(600)).toBe(true);
    await waitFor(() => expect(deckPlacement()).not.toBe(approved));
    const topDown = deckPlacement();
    /* Past either end the tilt holds. */
    turnWheel(600);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(deckPlacement()).toBe(topDown);

    turnWheel(-600);
    await waitFor(() => expect(deckPlacement()).toBe(approved));
  },
});

/**
 * On a short window the dock keeps its floor by growing up over the scene, to above the header's lower edge.
 * The header still paints above it there, so every control in it takes the pointer at its top, middle and bottom.
 */
export const ShortWindow = meta.story({
  /* Still, so no iris clips the corners the controls sit in. */
  globals: { viewport: { value: 'appShort' }, motion: 'reduce' },
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { shell, document } = await tablePage(canvasElement);
    await waitFor(() => expect(shell.parentElement).toHaveAttribute('data-scene-ready', 'true'), { timeout: 5000 });
    const header = shell.querySelector('header')!;
    const dock = shell.querySelector('.seated-controls-panel')!;
    expect(dock.getBoundingClientRect().top).toBeLessThan(header.getBoundingClientRect().bottom);
    const picker = within(header).getByRole('group', { name: 'Table view' });
    const controls = [
      ...within(picker).getAllByRole('button'),
      ...within(header).getAllByRole('button', { name: /^(Game menu|Previous phase|Next phase)$/ }),
    ];
    for (const control of controls) {
      const box = control.getBoundingClientRect();
      for (const y of [box.top + 2, box.top + box.height / 2, box.bottom - 2]) {
        const hit = document.elementFromPoint(box.left + box.width / 2, y);
        expect(
          control.contains(hit),
          `${control.textContent} at ${Math.round(y)} hits ${hit?.outerHTML.slice(0, 80)}`
        ).toBe(true);
      }
    }
  },
});

/**
 * A phase change moves the camera to the view the new phase recommends, and the view picker marks that view.
 * A table opened mid-phase marks its phase's view and stays on the map: the first move waits for the next phase.
 */
export const PhaseViews = meta.story({
  beforeEach: install(() => productTransport('seat-2', { ...playingSnapshot(), phase: 1 })),
  play: async ({ canvasElement }) => {
    const { page, shell } = await tablePage(canvasElement, TABLE_PHASES[1].label);
    const views = within(page.getByRole('group', { name: 'Table view' }));
    expect(views.getByRole('button', { name: 'Focus on right, recommended for this phase' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(shell).toHaveAttribute('data-table-view', 'map');

    session.transport.deliver(session.transport.view({ ...playingSnapshot(), phase: 2, revision: 1 }));
    await waitFor(() => expect(shell).toHaveAttribute('data-table-view', 'bottom'));
    expect(views.getByRole('button', { name: 'Focus on bottom, recommended for this phase' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(views.getByRole('button', { name: 'Focus on right' })).toHaveAttribute('aria-pressed', 'false');
  },
});

/**
 * A phase change during a carry marks the new phase's view at once and moves the camera only when the piece lands.
 * The carry is a press on the viewer's own forces and a move past the drag threshold, sent to the canvas `mapViewPoint` projects against.
 */
export const PhaseViewWaitsForTheDrop = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, shell, document } = await tablePage(canvasElement);
    const forces = playingSnapshot().table.pieces.find((piece) => piece.id === 'starting-1-carthag')!;
    const [clientX, clientY] = mapViewPoint(document, [
      forces.position[0],
      forces.position[1] + stackTopHeight(forces),
      forces.position[2],
    ]);
    const scene = document.querySelector('canvas')!;
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, clientY };
    await waitFor(
      () => {
        if (scene.style.cursor !== 'grabbing') {
          scene.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientX, buttons: 1 }));
          scene.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: clientX + 24, buttons: 1 }));
        }
        expect(scene.style.cursor).toBe('grabbing');
      },
      { timeout: 30_000 }
    );

    session.transport.deliver(session.transport.view({ ...playingSnapshot(), phase: 1, revision: 1 }));
    const views = within(page.getByRole('group', { name: 'Table view' }));
    await waitFor(() =>
      expect(views.getByRole('button', { name: 'Focus on right, recommended for this phase' })).toBeInTheDocument()
    );
    expect(shell).toHaveAttribute('data-table-view', 'map');
    expect(scene.style.cursor).toBe('grabbing');

    scene.dispatchEvent(new PointerEvent('pointerup', { ...pointer, clientX: clientX + 24, buttons: 0 }));
    await waitFor(() => expect(shell).toHaveAttribute('data-table-view', 'right'));
  },
});

/**
 * The spice supply disc answers the number keys again when the pointer leaves the canvas from the disc and comes straight back onto it.
 * The pointer leaves for the view picker and returns with no move over the rest of the table.
 */
export const SpiceDiscAnswersOnReturn = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, document } = await tablePage(canvasElement);
    const slot = spiceSupplySlot();
    const [clientX, clientY] = mapViewPoint(document, [slot.position[0], TRACKER_DISC_TOP_Y + 0.015, slot.position[2]]);
    const scene = document.querySelector('canvas')!;
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX, clientY };
    await waitFor(
      () => {
        scene.dispatchEvent(new PointerEvent('pointermove', pointer));
        expect(scene.style.cursor).toBe('pointer');
      },
      { timeout: 30_000 }
    );

    leaveTheCanvas(page, scene, pointer);
    await waitFor(() => expect(scene.style.cursor).toBe('default'));

    scene.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: clientX + 1 }));
    await waitFor(() => expect(scene.style.cursor).toBe('pointer'));
    await userEvent.keyboard('2');
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'spice-spawn', count: 2 } })
    );
  },
});

/**
 * A deck hovered when the pointer leaves the canvas, or when the window loses focus, stops answering its shuffle key.
 * The key acts again once the pointer is back over the deck.
 */
export const DeckShortcutsEndOffTheTable = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, document } = await tablePage(canvasElement);
    const deck = playingSnapshot().table.pieces.find((piece) => piece.id === 'treachery-deck')!;
    const [clientX, clientY] = mapViewPoint(document, [
      deck.position[0],
      deck.position[1] + stackTopHeight(deck),
      deck.position[2],
    ]);
    const scene = document.querySelector('canvas')!;
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX, clientY };
    const hoverTheDeck = (offset: number) =>
      waitFor(
        () => {
          scene.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: clientX + offset }));
          expect(scene.style.cursor).toBe('grab');
        },
        { timeout: 30_000 }
      );
    const commands = () => session.transport.messages.filter((message) => message.type === 'command').length;

    await hoverTheDeck(0);
    leaveTheCanvas(page, scene, pointer);
    await waitFor(() => expect(scene.style.cursor).toBe('default'));
    const before = commands();
    await userEvent.keyboard('r');
    expect(commands()).toBe(before);

    await hoverTheDeck(1);
    document.defaultView!.dispatchEvent(new FocusEvent('blur'));
    await waitFor(() => expect(scene.style.cursor).toBe('default'));
    await userEvent.keyboard('r');
    expect(commands()).toBe(before);

    await hoverTheDeck(2);
    await userEvent.keyboard('r');
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({
        type: 'command',
        action: { kind: 'deck-shuffle', pieceId: 'treachery-deck' },
      })
    );
  },
});

/**
 * A tap on the table still reaches the table's own click handlers although the touch leaves the canvas after every tap.
 * Tapping the deck selects it, so L locks it.
 * Tapping the empty board then clears the selection, so L sends nothing.
 */
export const TapOnTheBoardClearsTheSelection = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, document } = await tablePage(canvasElement);
    const deck = playingSnapshot().table.pieces.find((piece) => piece.id === 'treachery-deck')!;
    const deckPoint = mapViewPoint(document, [
      deck.position[0],
      deck.position[1] + stackTopHeight(deck),
      deck.position[2],
    ]);
    const boardPoint = mapViewPoint(document, [BOARD_RADIUS * 0.3, BOARD_SURFACE_Y, BOARD_RADIUS * 0.3]);
    const scene = document.querySelector('canvas')!;
    const tap = ([clientX, clientY]: [number, number]) => {
      const touch = {
        bubbles: true,
        cancelable: true,
        pointerId: 2,
        pointerType: 'touch',
        isPrimary: true,
        clientX,
        clientY,
      };
      scene.dispatchEvent(new PointerEvent('pointerdown', { ...touch, button: 0, buttons: 1 }));
      scene.dispatchEvent(new PointerEvent('pointerup', { ...touch, button: 0, buttons: 0 }));
      leaveTheCanvas(page, scene, touch);
      scene.dispatchEvent(new PointerEvent('click', { ...touch, button: 0 }));
    };
    const commands = () => session.transport.messages.filter((message) => message.type === 'command').length;

    await waitFor(
      async () => {
        tap(deckPoint);
        await userEvent.keyboard('l');
        expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'lock', pieceId: 'treachery-deck' } });
      },
      { timeout: 30_000 }
    );

    tap(boardPoint);
    const before = commands();
    await userEvent.keyboard('l');
    expect(commands()).toBe(before);
  },
});

/**
 * A finger resting on the deck opens the menu a right-click opens, since iOS never sends a context menu for a long press.
 * The menu's Shuffle shuffles that deck, and the finger lifting after the menu opens leaves the menu open.
 */
export const LongPressOnTheDeckOpensItsMenu = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, document } = await tablePage(canvasElement);
    const deck = playingSnapshot().table.pieces.find((piece) => piece.id === 'treachery-deck')!;
    const [clientX, clientY] = mapViewPoint(document, [
      deck.position[0],
      deck.position[1] + stackTopHeight(deck),
      deck.position[2],
    ]);
    const scene = document.querySelector('canvas')!;
    const touch = {
      bubbles: true,
      cancelable: true,
      pointerId: 3,
      pointerType: 'touch',
      isPrimary: true,
      clientX,
      clientY,
    };

    await waitFor(
      async () => {
        scene.dispatchEvent(new PointerEvent('pointerdown', { ...touch, button: 0, buttons: 1 }));
        await expect(page.findByRole('menuitem', { name: 'Shuffle' }, { timeout: 1500 })).resolves.toBeVisible();
      },
      { timeout: 30_000 }
    );
    scene.dispatchEvent(new PointerEvent('pointerup', { ...touch, button: 0, buttons: 0 }));
    await userEvent.click(page.getByRole('menuitem', { name: 'Shuffle' }));
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({
        type: 'command',
        action: { kind: 'deck-shuffle', pieceId: 'treachery-deck' },
      })
    );
  },
});

/** The pointer moves to the view picker, so a pointerleave reaches the canvas and each ancestor that does not contain the picker. */
function leaveTheCanvas(page: ReturnType<typeof within>, scene: HTMLCanvasElement, pointer: PointerEventInit) {
  const picker = page.getByRole('group', { name: 'Table view' });
  for (let left: Element | null = scene; left && !left.contains(picker); left = left.parentElement) {
    left.dispatchEvent(new PointerEvent('pointerleave', { ...pointer, bubbles: false }));
  }
}

/**
 * A canvas leave ends the disc's hover while the viewer cannot act, too.
 * The pointer rests on the disc when playback starts and leaves the canvas during playback, so after Return to live the number keys send nothing until the pointer is back on the disc.
 */
export const SpiceDiscForgetsAPlaybackHover = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, document } = await tablePage(canvasElement);
    await openTab(page, 'Phase');
    const slot = spiceSupplySlot();
    const [clientX, clientY] = mapViewPoint(document, [slot.position[0], TRACKER_DISC_TOP_Y + 0.015, slot.position[2]]);
    const scene = document.querySelector('canvas')!;
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX, clientY };
    await waitFor(
      () => {
        scene.dispatchEvent(new PointerEvent('pointermove', pointer));
        expect(scene.style.cursor).toBe('pointer');
      },
      { timeout: 30_000 }
    );

    await userEvent.click(page.getByRole('button', { name: 'Replay from start' }));
    session.transport.deliver({ type: 'history', step: 0, lastStep: 1, snapshot: playingSnapshot() });
    await waitFor(() => {
      expect(page.getByRole('button', { name: 'Earlier phase' })).toBeVisible();
      expect(scene.style.cursor).toBe('default');
    });
    leaveTheCanvas(page, scene, pointer);

    await userEvent.click(page.getByRole('button', { name: 'Return to live' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Replay from start' })).toBeEnabled());
    await userEvent.keyboard('3');
    expect(scene.style.cursor).toBe('default');
    expect(session.transport.messages.some((message) => message.type === 'command')).toBe(false);

    scene.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: clientX + 1 }));
    await waitFor(() => expect(scene.style.cursor).toBe('pointer'));
    await userEvent.keyboard('3');
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'spice-spawn', count: 3 } })
    );
  },
});
