import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { TABLE_PHASES } from '@shared/play/phases';
import { spiceBankSlot, createSpiceStack } from '@shared/play/spiceBank';
import { SHARED_ITEM_PLACEMENT_ANCHORS } from '@shared/play/tableFurnitureLayout';
import { restingPositionAt, stackTopHeight } from '@shared/play/tableGeometry';
import { TRACKER_DISC_TOP_Y } from '@shared/play/tableTrackers';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { tableOverlayRects } from '../../../widgets/tabletop/seatedHeader';
import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { mapViewPoint, openTab, tablePage, waitForPlayCamera, openPieceMenu } from './playing.stories.fixture';
import {
  factions,
  playingSnapshot,
  productTransport,
  playingSnapshot as initialSnapshot,
} from './product.stories.fixture';
import { factionOf, finishedSnapshot } from './results.stories.fixture';
import { openTableSettings } from './table.stories.fixture';

const meta = testingPreview.meta({
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
  globals: { motion: 'on' },
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

    /* The header's controls lead the Tab order: Tab from the page start reaches the header before the chrome under it. The pointer rests on the view buttons, not the table, so Tab moves focus instead of pinging (#2043). */
    const header = shell.querySelector('header')!;
    const launcher = page.getByRole('button', { name: /^Controls/ });
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    let focused: Element | null = null;
    for (let press = 0; press < 50 && focused !== launcher && !header.contains(focused); press++) {
      await userEvent.tab();
      focused = document.activeElement;
    }
    await expect(header.contains(focused), `Tab reaches ${focused?.outerHTML.slice(0, 80)} first`).toBe(true);

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

/** The dial's hub looks straight down on the board; pressed again, or with U, the camera comes back to the view it left. */
export const TopDown = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, shell } = await tablePage(canvasElement);
    const dial = within(page.getByRole('group', { name: 'Table view' }));
    await userEvent.click(dial.getByRole('button', { name: /^Focus on left/ }));
    await expect(shell).toHaveAttribute('data-table-view', 'left');
    const hub = dial.getByRole('button', { name: 'Focus on top, straight down' });
    await userEvent.click(hub);
    await expect(hub).toHaveAttribute('aria-pressed', 'true');
    await expect(shell).toHaveAttribute('data-table-view', 'top');
    await userEvent.click(hub);
    await expect(hub).toHaveAttribute('aria-pressed', 'false');
    await expect(shell).toHaveAttribute('data-table-view', 'left');
    /* The key does the same from the table, with no control focused. */
    if (canvasElement.ownerDocument.activeElement instanceof HTMLElement) {
      canvasElement.ownerDocument.activeElement.blur();
    }
    await userEvent.keyboard('u');
    await expect(shell).toHaveAttribute('data-table-view', 'top');
    await userEvent.keyboard('u');
    await expect(shell).toHaveAttribute('data-table-view', 'left');
  },
});

/* Holding Control names every piece and its owning faction; a shared piece shows its name alone, and letting go clears the names. */
export const PieceNames = meta.story({
  globals: { motion: 'on' },
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
    const counts = await openTableSettings(canvasElement);
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

/* The pieces the eight shared slots hold, in slot order: the published traitor deck, a treachery deck, a card and five tokens. */
function sharedSlotPieces(snapshot: ReturnType<typeof playingSnapshot>) {
  const cards = snapshot.table.pieces.filter((piece) => piece.kind === 'card');
  const troops = snapshot.table.pieces.filter((piece) => piece.kind === 'force' && !piece.inventory).slice(0, 5);
  return [...cards, ...troops];
}

export const SharedItemSlots = meta.story({
  beforeEach: install(() => {
    const snapshot = playingSnapshot();
    sharedSlotPieces(snapshot).forEach((piece, index) => {
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
    /* The scene mounts a count tag for every piece it draws, so each of the eight slots' pieces is on the table. */
    const pieces = sharedSlotPieces(playingSnapshot());
    await expect(pieces).toHaveLength(SHARED_ITEM_PLACEMENT_ANCHORS.length);
    for (const { id } of pieces) {
      await waitFor(() => expect(shell.querySelector(`[data-piece-id="${id}"]`)).toBeInTheDocument());
    }
    /* The slots are two rows of four along the bottom edge: each row's tags run left to right in slot order, and the second row sits nearer the viewer. */
    await waitForFrame(async () => {
      const centers = pieces.map(({ id }) => {
        const rect = shell.querySelector(`[data-piece-id="${id}"]`)!.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });
      const [far, near] = [centers.slice(0, 4), centers.slice(4)];
      for (const row of [far, near]) {
        for (let slot = 1; slot < row.length; slot += 1) {
          await expect(row[slot]!.x).toBeGreaterThan(row[slot - 1]!.x);
        }
      }
      await expect(Math.min(...near.map(({ y }) => y))).toBeGreaterThan(Math.max(...far.map(({ y }) => y)));
    });
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
    const menu = await openPieceMenu(document, spice, 'Spice actions');
    await expect(within(menu).getByRole('menuitem', { name: 'Take into spice reserve' })).toBeEnabled();
    await userEvent.keyboard('{Escape}');
    await waitForFrame(() => expect(within(document.body).queryByRole('menu')).toBeNull());
  },
});

/* The wheel over the board moves in for a close look and backs out to the view's own pose; Ctrl with the wheel stays the browser's zoom. */
export const WheelTakesACloseLook = meta.story({
  globals: { motion: 'on' },
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

    const layout = () => ({
      viewport: [window.innerWidth, window.innerHeight, window.devicePixelRatio],
      canvas: canvas.getBoundingClientRect().toJSON(),
      drawingBuffer: [canvas.width, canvas.height],
      camera: canvas.getAttribute('data-play-camera'),
      overlays: tableOverlayRects(canvas),
    });
    const baselineLayout = layout();
    const returnPlacements: { atMs: number; placement: string | undefined }[] = [];
    const recordReturn = () => {
      const placement = deckPlacement();
      returnPlacements.push({ atMs: Math.round(performance.now()), placement });
      if (returnPlacements.length > 12) {
        returnPlacements.shift();
      }
      return placement;
    };

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
    try {
      /* The glide needs frames to finish even when the runner draws them late (#1900). */
      await waitForFrame(() => expectPlacementNear(recordReturn(), approved));
      turnWheel(-600);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await expectPlacementNear(recordReturn(), approved);
    } catch (error) {
      /* Keep the failed runner's geometry to distinguish layout reframing from a return-glide defect (#2510). */
      if (error instanceof Error) {
        error.message += `\nWheel return geometry: ${JSON.stringify({ approved, baselineLayout, returnedLayout: layout(), returnPlacements })}`;
      }
      throw error;
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
 * On a short window the header's chips and the camera dial still have the table to themselves.
 * Each of their controls takes the pointer at its top, middle and bottom, and the dial hangs under the toolbar's chip.
 */
export const ShortWindow = meta.story({
  /* Still, so no iris clips the corners the controls sit in. */
  globals: { viewport: { value: 'appShort' }, motion: 'reduce' },
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { shell } = await tablePage(canvasElement);
    await waitFor(() => expect(shell.parentElement).toHaveAttribute('data-scene-ready', 'true'), { timeout: 5000 });
    await expectControlsTakeThePointer(shell);
    const toolbar = shell.querySelector('.seated-toolbar')!.getBoundingClientRect();
    const camera = shell.querySelector('.seated-camera')!.getBoundingClientRect();
    await expect(camera.top).toBeGreaterThanOrEqual(toolbar.bottom);
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
 * A canvas leave ends the disc's hover while the viewer cannot act, too: another player continues the finished game during this replay.
 * The pointer moves over the disc during playback and leaves the canvas, so after Return to live the number keys send nothing until the pointer is back on the disc.
 */
export const SpiceDiscForgetsAPlaybackHover = meta.story({
  beforeEach: install(() => productTransport('seat-2', finishedSnapshot('seat-2'))),
  play: async ({ canvasElement }) => {
    const finished = finishedSnapshot('seat-2');
    const { page, document } = await tablePage(
      canvasElement,
      `${factionOf(finished, 0).name} and ${factionOf(finished, 2).name} won as an alliance`
    );
    await openTab(page, 'Replay');
    await userEvent.click(await page.findByRole('button', { name: 'Replay from start' }));
    session.transport.deliver({ type: 'history', step: 0, lastStep: 1, snapshot: playingSnapshot() });
    await expect(await page.findByRole('button', { name: 'Earlier phase' })).toBeVisible();
    session.transport.deliver(session.transport.view({ ...playingSnapshot(), revision: 100 }));

    const slot = spiceBankSlot();
    const [clientX, clientY] = mapViewPoint(document, [slot.position[0], TRACKER_DISC_TOP_Y + 0.015, slot.position[2]]);
    const scene = document.querySelector('canvas')!;
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX, clientY };
    scene.dispatchEvent(new PointerEvent('pointermove', pointer));
    /* The canvas never offered the disc, so its cursor is unset or the default one. */
    await waitFor(() => expect(['', 'default'], 'playback disables the disc').toContain(scene.style.cursor));
    leaveTheCanvas(page, scene, pointer);

    await userEvent.click(page.getByRole('button', { name: 'Return to live' }));
    await waitFor(() => expect(page.queryByRole('button', { name: 'Earlier phase' })).toBeNull());
    await userEvent.keyboard('3');
    await expect(['', 'default'], 'returning to live retains no earlier hover').toContain(scene.style.cursor);
    await expect(session.transport.messages.some((message) => message.type === 'command')).toBe(false);

    /* Move onto the returning disc on each poll while its 3D target settles; the live table's panels may move the canvas, so the point is mapped again. */
    await waitFor(
      async () => {
        const [liveX, liveY] = mapViewPoint(document, [slot.position[0], TRACKER_DISC_TOP_Y + 0.015, slot.position[2]]);
        scene.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: liveX + 1, clientY: liveY }));
        await expect(scene.style.cursor, 'the pointer returns to the live disc').toBe('pointer');
      },
      { timeout: 30_000 }
    );
    await userEvent.keyboard('3');
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'spice-spawn', count: 3 } })
    );
  },
});
