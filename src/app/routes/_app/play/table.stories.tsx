import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { TABLE_PHASES } from '@shared/play/phases';
import { item, piece, place } from '@shared/play/setupSupply';
import { spiceBankSlot, createSpiceStack } from '@shared/play/spiceBank';
import { cardBaySlotPositions, SHARED_ITEM_PLACEMENT_ANCHORS } from '@shared/play/tableFurnitureLayout';
import { BOARD_RADIUS, BOARD_SURFACE_Y, restingPositionAt, stackTopHeight } from '@shared/play/tableGeometry';
import { TRACKER_DISC_TOP_Y } from '@shared/play/tableTrackers';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { mapViewPoint, openTab, tablePage, waitForPlayCamera, openPieceMenu } from './playing.stories.fixture';
import {
  cardBack,
  factions,
  playingSnapshot,
  productTransport,
  playingSnapshot as initialSnapshot,
} from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Table',
});

/* A tag's placement rounds to whole pixels, so a glide that settles a hair short of the pose can land one pixel off (#1957). */
async function expectPlacementNear(actual: string | undefined, expected: string | undefined) {
  const parse = async (transform: string | undefined) => {
    const match = transform?.match(/^translate3d\((-?[\d.]+)px, (-?[\d.]+)px, (-?[\d.]+)px\)(.*)$/);
    await expect(match, `an unexpected placement: ${transform}`).toBeTruthy();
    return { x: Number(match![1]), y: Number(match![2]), rest: `${match![3]}${match![4]}` };
  };
  const [got, want] = [await parse(actual), await parse(expected)];
  await expect(Math.abs(got.x - want.x), `${actual} against ${expected}`).toBeLessThanOrEqual(1);
  await expect(Math.abs(got.y - want.y), `${actual} against ${expected}`).toBeLessThanOrEqual(1);
  await expect(got.rest).toBe(want.rest);
}

/* Each control of the camera dial and the header's toolbar takes the pointer at its top, middle and bottom. */
async function expectControlsTakeThePointer(shell: HTMLElement) {
  const header = shell.querySelector('header')!;
  const picker = within(shell).getByRole('group', { name: 'Table view' });
  const controls = [
    ...within(picker).getAllByRole('button'),
    ...within(header).getAllByRole('button', { name: /^(Game menu|More phase actions|Next phase)$/ }),
  ];
  for (const control of controls) {
    const box = control.getBoundingClientRect();
    for (const y of [box.top + 2, box.top + box.height / 2, box.bottom - 2]) {
      const hit = shell.ownerDocument.elementFromPoint(box.left + box.width / 2, y);
      await expect(
        control.contains(hit),
        `${control.textContent} at ${Math.round(y)} hits ${hit?.outerHTML.slice(0, 80)}`
      ).toBe(true);
    }
  }
}

/** Where the top of the treachery deck shows on the map view. */
function deckPoint(document: Document) {
  const deck = playingSnapshot().table.pieces.find((piece) => piece.id === 'treachery-deck')!;
  return mapViewPoint(document, [deck.position[0], deck.position[1] + stackTopHeight(deck), deck.position[2]]);
}

function touchAt(pointerId: number, clientX: number, clientY: number) {
  return { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', isPrimary: true, clientX, clientY };
}

function theDeckShuffled() {
  return waitFor(() =>
    expect(lastCommand()).toMatchObject({
      type: 'command',
      action: { kind: 'deck-shuffle', pieceId: 'treachery-deck' },
    })
  );
}

/** The pointer moves to the view picker, so a pointerleave reaches the canvas and each ancestor that does not contain the picker. */
function leaveTheCanvas(page: ReturnType<typeof within>, scene: HTMLCanvasElement, pointer: PointerEventInit) {
  const picker = page.getByRole('group', { name: 'Table view' });
  for (let left: Element | null = scene; left && !left.contains(picker); left = left.parentElement) {
    left.dispatchEvent(new PointerEvent('pointerleave', { ...pointer, bubbles: false }));
  }
}

export const Controls = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, shell, document } = await tablePage(canvasElement);
    const viewButtons = within(page.getByRole('group', { name: 'Table view' }));

    for (const view of ['left', 'right', 'bottom', 'map']) {
      const button = viewButtons.getByRole('button', { name: new RegExp(`^Focus on ${view}`) });
      await userEvent.click(button);
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(shell).toHaveAttribute('data-table-view', view);
    }

    /* The header's controls lead the Tab order: Tab from the page start reaches the header before the separator. The pointer rests on the view buttons, not the table, so Tab moves focus instead of pinging (#2043). */
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
    await expect(header.contains(focused), `Tab reaches ${focused?.outerHTML.slice(0, 80)} first`).toBe(true);

    divider.focus();
    await userEvent.keyboard('{Home}');
    await expect(divider.getAttribute('aria-valuenow')).toBe(divider.getAttribute('aria-valuemin'));
    const minimum = Number(divider.getAttribute('aria-valuenow'));
    await userEvent.keyboard('{ArrowUp}');
    await expect(Number(divider.getAttribute('aria-valuenow'))).toBeGreaterThan(minimum);
    await userEvent.keyboard('{End}');
    await expect(divider.getAttribute('aria-valuenow')).toBe(divider.getAttribute('aria-valuemax'));
    await userEvent.tab();

    const counters = Array.from(shell.querySelectorAll<HTMLElement>('.scene-piece-count'));
    await expect(counters.length).toBeGreaterThan(0);
    for (const counter of counters) {
      await expect(counter).not.toBeVisible();
    }
    await userEvent.keyboard('{Alt>}');
    await expect(shell).toHaveAttribute('data-show-counts', 'true');
    for (const counter of counters) {
      await expect(counter).toBeVisible();
    }
    window.dispatchEvent(new Event('blur'));
    await waitFor(() => expect(shell).toHaveAttribute('data-show-counts', 'false'));
    for (const counter of counters) {
      await expect(counter).not.toBeVisible();
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

    await expect(troopName).not.toBeVisible();
    await user.keyboard('{Control>}');
    await expect(shell).toHaveAttribute('data-show-names', 'true');
    await expect(shell).toHaveAttribute('data-show-counts', 'false');
    await expect(troopName).toBeVisible();
    await expect(within(troopName).getByText(troop.label)).toBeVisible();
    await expect(within(troopName).getByText(factions[0]!.data.name)).toBeVisible();
    await expect(deckName).toBeVisible();
    await expect(deckName.querySelector('.scene-piece-name__owner')).toBeNull();
    /* Control shows names only: the counts wait for Alt, and holding both shows both. */
    for (const counter of counters) {
      await expect(counter).not.toBeVisible();
    }
    await user.keyboard('{Alt>}');
    await expect(shell).toHaveAttribute('data-show-counts', 'true');
    await expect(troopName).toBeVisible();
    await expect(counters[0]).toBeVisible();
    await user.keyboard('{/Alt}');
    await expect(counters[0]).not.toBeVisible();
    await expect(troopName).toBeVisible();

    await user.keyboard('{/Control}');
    await expect(shell).toHaveAttribute('data-show-names', 'false');
    await expect(troopName).not.toBeVisible();
    await expect(deckName).not.toBeVisible();
  },
});

/* The settings menu keeps the stack counts or piece names on, for a screen with no Alt or Control to hold, until it turns them off again. */
export const SettingsKeepLabelsOn = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, shell } = await tablePage(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
    const counts = await page.findByRole('menuitemcheckbox', { name: /^Stack counts/ });
    const names = page.getByRole('menuitemcheckbox', { name: /^Piece names/ });
    await expect(shell).toHaveAttribute('data-show-counts', 'false');
    await expect(shell).toHaveAttribute('data-show-names', 'false');

    /* Each toggle leaves the menu open, so both labels can be set in one visit. */
    await userEvent.click(counts);
    await expect(counts).toHaveAttribute('aria-checked', 'true');
    await expect(shell).toHaveAttribute('data-show-counts', 'true');
    await userEvent.click(names);
    await expect(shell).toHaveAttribute('data-show-names', 'true');
    await userEvent.click(counts);
    await expect(counts).toHaveAttribute('aria-checked', 'false');
    await expect(shell).toHaveAttribute('data-show-counts', 'false');
    await expect(shell).toHaveAttribute('data-show-names', 'true');
  },
});

/* Eight shared slots holding the published traitor deck, a treachery deck, a card and five tokens. */
export const SharedItemSlots = meta.story({
  beforeEach: install(() => {
    const snapshot = playingSnapshot();
    const cards = snapshot.table.pieces.filter((piece) => piece.kind === 'card');
    const troops = snapshot.table.pieces.filter((piece) => piece.kind === 'force' && !piece.inventory).slice(0, 5);
    [...cards, ...troops].forEach((piece, index) => {
      piece.orientation = 0;
      piece.position = restingPositionAt(SHARED_ITEM_PLACEMENT_ANCHORS[index]!.position, piece);
      piece.zoneId = null;
    });
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const { page, shell, document } = await tablePage(canvasElement);
    await userEvent.click(page.getByRole('button', { name: /^Focus on bottom/ }));
    await waitFor(() => expect(shell).toHaveAttribute('data-table-view', 'bottom'));
    await waitForPlayCamera(document);
  },
});

/** A spice stack's menu announces itself as spice actions; Play/Panels/Layout/SchemeIsland covers the deck's. */
export const SpiceMenuName = meta.story({
  beforeEach: install(() => {
    const snapshot = initialSnapshot();
    snapshot.table.pieces.push(createSpiceStack(snapshot.table.nextEventNumber, 3));
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const spice = createSpiceStack(initialSnapshot().table.nextEventNumber, 3);
    await waitFor(() => expect(document.querySelector('[data-scene-ready="true"] canvas')).not.toBeNull(), {
      timeout: 30_000,
    });
    await openPieceMenu(document, spice, 'Spice actions');
    await userEvent.keyboard('{Escape}');
    await waitForFrame(() => expect(within(document.body).queryByRole('menu')).toBeNull());
  },
});

/* The wheel over the board moves in for a close look and backs out to the view's own pose; Ctrl with the wheel stays the browser's zoom. */
export const WheelTakesACloseLook = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { shell, document } = await tablePage(canvasElement);
    const canvas = shell.querySelector('canvas')!;
    /* The deck's tag follows the camera, so its placement shows where the camera stands. */
    const deckPlacement = () =>
      document.querySelector('[data-piece-id="treachery-deck"]')?.closest('div')?.parentElement?.style.transform;
    const box = canvas.getBoundingClientRect();
    const turnWheel = (deltaY: number, ctrlKey = false) => {
      const event = new WheelEvent('wheel', {
        deltaY,
        ctrlKey,
        bubbles: true,
        cancelable: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
      });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    };
    /* The tag is placed on a frame, so on a runner whose frames run seconds late the view's pose is read once a frame passes without moving it. */
    let previous = deckPlacement();
    const approved = await waitForFrame(async () => {
      const placement = deckPlacement();
      const settled = placement === previous;
      previous = placement;
      await expect(settled && placement && !placement.includes('-9999px')).toBe(true);
      return placement!;
    });

    await expect(turnWheel(300, true)).toBe(false);
    await expect(turnWheel(300)).toBe(true);
    await waitForFrame(() => expect(deckPlacement()).not.toBe(approved));
    const closer = deckPlacement();
    turnWheel(300);
    await waitForFrame(() => expect(deckPlacement()).not.toBe(closer));

    /* Backing out ends at the view's own pose, and holds there however far the wheel turns. */
    for (let turn = 0; turn < 4; turn++) {
      turnWheel(-600);
    }
    /* The glide needs frames to finish even when the runner draws them late (#1900). */
    await waitForFrame(() => expectPlacementNear(deckPlacement(), approved));
    turnWheel(-600);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expectPlacementNear(deckPlacement(), approved);
  },
});

/* Two fingers dragged up over the board tilt the camera toward top-down, and dragged down tilt it back. */
export const TwoFingersTiltTheCamera = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { shell, document } = await tablePage(canvasElement);
    const canvas = shell.querySelector('canvas')!;
    const deckPlacement = () =>
      document.querySelector('[data-piece-id="treachery-deck"]')?.closest('div')?.parentElement?.style.transform;
    const box = canvas.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const finger = (type: string, pointerId: number, clientX: number, clientY: number) =>
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', clientX, clientY });
    const drag = (fromY: number, toY: number) => {
      canvas.dispatchEvent(finger('pointerdown', 11, x - 40, fromY));
      canvas.dispatchEvent(finger('pointerdown', 12, x + 40, fromY));
      for (let step = 1; step <= 6; step++) {
        const y = fromY + ((toY - fromY) * step) / 6;
        window.dispatchEvent(finger('pointermove', 11, x - 40, y));
        window.dispatchEvent(finger('pointermove', 12, x + 40, y));
      }
      window.dispatchEvent(finger('pointerup', 11, x - 40, toY));
      window.dispatchEvent(finger('pointerup', 12, x + 40, toY));
    };
    const approved = deckPlacement();
    await expect(approved).toBeTruthy();

    drag(box.bottom - 10, box.bottom - 10 - 600);
    await waitFor(() => expect(deckPlacement()).not.toBe(approved));
    drag(box.bottom - 10 - 600, box.bottom - 10);
    await waitFor(() => expect(deckPlacement()).toBe(approved));
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
    await expect(views.getByRole('button', { name: 'Focus on right, recommended for this phase' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await expect(shell).toHaveAttribute('data-table-view', 'map');

    session.transport.deliver(session.transport.view({ ...playingSnapshot(), phase: 2, revision: 1 }));
    await waitFor(() => expect(shell).toHaveAttribute('data-table-view', 'bottom'));
    await expect(views.getByRole('button', { name: 'Focus on bottom, recommended for this phase' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(views.getByRole('button', { name: 'Focus on right' })).toHaveAttribute('aria-pressed', 'false');
  },
});

/**
 * A phase change during a carry marks the new phase's view at once and moves the camera only when the piece lands.
 * The carry is a press on the viewer's own troops and a move past the drag threshold, sent to the canvas `mapViewPoint` projects against.
 */
export const PhaseViewWaitsForTheDrop = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, shell, document } = await tablePage(canvasElement);
    const troops = playingSnapshot().table.pieces.find((piece) => piece.id === 'starting-1-carthag')!;
    const [clientX, clientY] = mapViewPoint(document, [
      troops.position[0],
      troops.position[1] + stackTopHeight(troops),
      troops.position[2],
    ]);
    const scene = document.querySelector('canvas')!;
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, clientY };
    await waitFor(
      async () => {
        if (scene.style.cursor !== 'grabbing') {
          scene.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientX, buttons: 1 }));
          scene.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: clientX + 24, buttons: 1 }));
        }
        await expect(scene.style.cursor).toBe('grabbing');
      },
      { timeout: 30_000 }
    );

    session.transport.deliver(session.transport.view({ ...playingSnapshot(), phase: 1, revision: 1 }));
    const views = within(page.getByRole('group', { name: 'Table view' }));
    await waitFor(() =>
      expect(views.getByRole('button', { name: 'Focus on right, recommended for this phase' })).toBeInTheDocument()
    );
    await expect(shell).toHaveAttribute('data-table-view', 'map');
    await expect(scene.style.cursor).toBe('grabbing');

    scene.dispatchEvent(new PointerEvent('pointerup', { ...pointer, clientX: clientX + 24, buttons: 0 }));
    await waitFor(() => expect(shell).toHaveAttribute('data-table-view', 'right'));
  },
});

/**
 * On a short window the dock keeps its floor by growing up over the scene, to above the header's lower edge.
 * The header and the camera dial still paint above it there, so each of their controls takes the pointer at its top, middle and bottom.
 */
export const ShortWindow = meta.story({
  /* Still, so no iris clips the corners the controls sit in. */
  globals: { viewport: { value: 'appShort' }, motion: 'reduce' },
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { shell } = await tablePage(canvasElement);
    await waitFor(() => expect(shell.parentElement).toHaveAttribute('data-scene-ready', 'true'), { timeout: 5000 });
    const header = shell.querySelector('header')!;
    const dock = shell.querySelector('.seated-controls-panel')!;
    await expect(dock.getBoundingClientRect().top).toBeLessThan(header.getBoundingClientRect().bottom);
    /* The dock grows up over the scene here, so the fixed split draws no separator across it. */
    await expect(shell.querySelector('[role="separator"][aria-orientation="horizontal"]')).not.toBeVisible();
    await expectControlsTakeThePointer(shell);
  },
});

/* Just above the height where the split is fixed, the scene above the dock is shorter than the dial: it slides down over the dock rather than under the header's chips. */
export const LowWindow = meta.story({
  globals: { viewport: { value: 'appLow' }, motion: 'reduce' },
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { shell } = await tablePage(canvasElement);
    await waitFor(() => expect(shell.parentElement).toHaveAttribute('data-scene-ready', 'true'), { timeout: 5000 });
    await expect(shell.querySelector('[role="separator"][aria-orientation="horizontal"]')).toBeVisible();
    await expectControlsTakeThePointer(shell);
    /* Docked, the dial keeps a column of its own: the panes beside it stay clear of it. */
    const camera = shell.querySelector('.seated-camera')!.getBoundingClientRect();
    for (const pane of shell.querySelectorAll('.seated-controls-panel > :not(.seated-camera)')) {
      await expect(pane.getBoundingClientRect().right, `${pane.className} runs under the dial`).toBeLessThanOrEqual(
        camera.left
      );
    }
  },
});

/**
 * The Spice Bank disc answers the number keys again when the pointer leaves the canvas from the disc and comes straight back onto it.
 * The pointer leaves for the view picker and returns with no move over the rest of the table.
 */
export const SpiceDiscAnswersOnReturn = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, document } = await tablePage(canvasElement);
    const slot = spiceBankSlot();
    const [clientX, clientY] = mapViewPoint(document, [slot.position[0], TRACKER_DISC_TOP_Y + 0.015, slot.position[2]]);
    const scene = document.querySelector('canvas')!;
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX, clientY };
    await waitFor(
      async () => {
        scene.dispatchEvent(new PointerEvent('pointermove', pointer));
        await expect(scene.style.cursor).toBe('pointer');
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
    const [clientX, clientY] = deckPoint(document);
    const scene = document.querySelector('canvas')!;
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX, clientY };
    const hoverTheDeck = (offset: number) =>
      waitFor(
        async () => {
          scene.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: clientX + offset }));
          await expect(scene.style.cursor).toBe('grab');
        },
        { timeout: 30_000 }
      );
    const commands = () => session.transport.messages.filter((message) => message.type === 'command').length;

    await hoverTheDeck(0);
    leaveTheCanvas(page, scene, pointer);
    await waitFor(() => expect(scene.style.cursor).toBe('default'));
    const before = commands();
    await userEvent.keyboard('r');
    await expect(commands()).toBe(before);

    await hoverTheDeck(1);
    document.defaultView!.dispatchEvent(new FocusEvent('blur'));
    await waitFor(() => expect(scene.style.cursor).toBe('default'));
    await userEvent.keyboard('r');
    await expect(commands()).toBe(before);

    await hoverTheDeck(2);
    await userEvent.keyboard('r');
    await theDeckShuffled();
  },
});

/**
 * A canvas leave ends the disc's hover while the viewer cannot act, too.
 * The pointer rests on the disc when playback starts and leaves the canvas during playback, so after Return to live the number keys send nothing until the pointer is back on the disc.
 */
export const SpiceDiscForgetsAPlaybackHover = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, document } = await tablePage(canvasElement);
    await openTab(page, 'Replay');
    const slot = spiceBankSlot();
    const [clientX, clientY] = mapViewPoint(document, [slot.position[0], TRACKER_DISC_TOP_Y + 0.015, slot.position[2]]);
    const scene = document.querySelector('canvas')!;
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX, clientY };
    await waitFor(
      async () => {
        scene.dispatchEvent(new PointerEvent('pointermove', pointer));
        await expect(scene.style.cursor).toBe('pointer');
      },
      { timeout: 30_000 }
    );

    await userEvent.click(page.getByRole('button', { name: 'Replay from start' }));
    session.transport.deliver({ type: 'history', step: 0, lastStep: 1, snapshot: playingSnapshot() });
    await waitFor(async () => {
      await expect(page.getByRole('button', { name: 'Earlier phase' })).toBeVisible();
      await expect(scene.style.cursor).toBe('default');
    });
    leaveTheCanvas(page, scene, pointer);

    await userEvent.click(page.getByRole('button', { name: 'Return to live' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Replay from start' })).toBeEnabled());
    await userEvent.keyboard('3');
    await expect(scene.style.cursor).toBe('default');
    await expect(session.transport.messages.some((message) => message.type === 'command')).toBe(false);

    scene.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: clientX + 1 }));
    await waitFor(() => expect(scene.style.cursor).toBe('pointer'));
    await userEvent.keyboard('3');
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'spice-spawn', count: 3 } })
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
    const deckOnScreen = deckPoint(document);
    const boardPoint = mapViewPoint(document, [BOARD_RADIUS * 0.3, BOARD_SURFACE_Y, BOARD_RADIUS * 0.3]);
    const scene = document.querySelector('canvas')!;
    const tap = ([clientX, clientY]: [number, number]) => {
      const touch = touchAt(2, clientX, clientY);
      scene.dispatchEvent(new PointerEvent('pointerdown', { ...touch, button: 0, buttons: 1 }));
      scene.dispatchEvent(new PointerEvent('pointerup', { ...touch, button: 0, buttons: 0 }));
      leaveTheCanvas(page, scene, touch);
      scene.dispatchEvent(new PointerEvent('click', { ...touch, button: 0 }));
    };
    const commands = () => session.transport.messages.filter((message) => message.type === 'command').length;

    await waitFor(
      async () => {
        tap(deckOnScreen);
        await userEvent.keyboard('l');
        await expect(lastCommand()).toMatchObject({
          type: 'command',
          action: { kind: 'lock', pieceId: 'treachery-deck' },
        });
      },
      { timeout: 30_000 }
    );

    tap(boardPoint);
    const before = commands();
    await userEvent.keyboard('l');
    await expect(commands()).toBe(before);
  },
});

/**
 * A finger has no hover, so a tap's jitter over a piece leaves nothing for the keys to act on once the selection moves.
 * Tapping the deck with a jitter selects it, so L locks it.
 * Tapping the empty board then clears the selection, so L sends nothing.
 */
export const TapJitterLeavesNoHover = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, document } = await tablePage(canvasElement);
    const deckOnScreen = deckPoint(document);
    const boardPoint = mapViewPoint(document, [BOARD_RADIUS * 0.3, BOARD_SURFACE_Y, BOARD_RADIUS * 0.3]);
    const scene = document.querySelector('canvas')!;
    const tap = ([clientX, clientY]: [number, number], jitter: number) => {
      const touch = touchAt(2, clientX, clientY);
      scene.dispatchEvent(new PointerEvent('pointerdown', { ...touch, button: 0, buttons: 1 }));
      if (jitter) {
        scene.dispatchEvent(new PointerEvent('pointermove', { ...touch, clientX: clientX + jitter, buttons: 1 }));
      }
      scene.dispatchEvent(new PointerEvent('pointerup', { ...touch, button: 0, buttons: 0 }));
      leaveTheCanvas(page, scene, touch);
      scene.dispatchEvent(new PointerEvent('click', { ...touch, button: 0 }));
    };
    const commands = () => session.transport.messages.filter((message) => message.type === 'command').length;

    await waitFor(
      async () => {
        tap(deckOnScreen, 2);
        await userEvent.keyboard('l');
        await expect(lastCommand()).toMatchObject({
          type: 'command',
          action: { kind: 'lock', pieceId: 'treachery-deck' },
        });
      },
      { timeout: 30_000 }
    );

    tap(boardPoint, 0);
    const before = commands();
    await userEvent.keyboard('l');
    await expect(commands()).toBe(before);
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
    const [clientX, clientY] = deckPoint(document);
    const scene = document.querySelector('canvas')!;
    const touch = touchAt(3, clientX, clientY);

    await waitFor(
      async () => {
        /* A press while the ring is open closes it, so the finger only goes down again while no ring shows. */
        if (!page.queryByRole('menu')) {
          scene.dispatchEvent(new PointerEvent('pointerdown', { ...touch, button: 0, buttons: 1 }));
        }
        await expect(page.findByRole('menuitem', { name: 'Shuffle' }, { timeout: 1500 })).resolves.toBeVisible();
      },
      { timeout: 30_000 }
    );
    scene.dispatchEvent(new PointerEvent('pointerup', { ...touch, button: 0, buttons: 0 }));
    await userEvent.click(page.getByRole('menuitem', { name: 'Shuffle' }));
    await theDeckShuffled();
  },
});

const READABLE_CARDS: [string, string][] = [
  ['Snooper', '/play-fixtures/dreamrules/snooper.jpg'],
  ['Broken Land', '/play-fixtures/dreamrules/broken-land.jpg'],
  ['Atreides Traitor', '/play-fixtures/product/house-atreides-traitor-0.jpg'],
  ['Atreides Traitor', '/play-fixtures/product/house-atreides-traitor-1.jpg'],
  ['Harkonnen Traitor', '/play-fixtures/product/house-harkonnen-traitor-0.jpg'],
];

/* Cards with small print face up in the left card bay: their table faces are scaled to 512 px, which read sharper than the published size in a blind comparison. */
function readableCardsSnapshot() {
  const snapshot = playingSnapshot('seat-2');
  READABLE_CARDS.forEach(([name, path], index) => {
    const front = new URL(path, location.origin).href;
    snapshot.table.pieces.push(
      place(
        {
          ...piece(`readable-card-${index}`, name, 'shared', '#ad8a45', 'card', `readable:${index}`),
          items: [item(`readable-item-${index}`, name, front, cardBack(), 'card-treachery', true, 'Treachery')],
        },
        cardBaySlotPositions('left')[index]!
      )
    );
  });
  snapshot.versions = Object.fromEntries(snapshot.table.pieces.map((entry) => [entry.id, snapshot.revision]));
  return snapshot;
}

export const ReadableCards = meta.story({
  beforeEach: install(() => productTransport('seat-2', readableCardsSnapshot())),
});
