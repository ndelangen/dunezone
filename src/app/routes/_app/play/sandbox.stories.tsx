import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { chapter, journeyViewers, JourneyPage } from './journey.stories.fixture';
import { expectHeaderPhase, openTab, phaseControls } from './playing.stories.fixture';
import { sandbox, sandboxDecorator, sandboxSteps, sandboxTransport } from './sandbox.stories.fixture';
import { COLUMNS_MIN_WIDTH_REM, setTableLayout } from './tableLayout';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Sandbox',
  component: JourneyPage,
  args: { ...gameMeta.args, step: chapter('Bidding'), seat: 'seat-1' },
  argTypes: {
    step: {
      control: { type: 'range', min: sandboxSteps()[0]! + 1, max: sandboxSteps().at(-1)! + 1, step: 1 },
    },
    seat: { control: 'select', options: journeyViewers() },
  },
  parameters: {
    ...gameMeta.parameters,
    controls: { disable: false, include: ['step', 'seat'] },
    docs: {
      description: {
        component:
          "The game Worker's own table running in the browser, started from the room's stored state at a step of Play/Journey (J13 onwards). Drag pieces, draw cards, change phases and fight battles as any seat; the panel switches seats and restarts the table. Drafting, seats, votes, the result and the log stay as recorded.",
      },
    },
  },
  beforeEach: ({ args }) =>
    install(() => sandboxTransport({ start: Number(args.step ?? 1) - 1, seat: String(args.seat ?? 'seat-1') }))(),
  decorators: [...gameMeta.decorators, sandboxDecorator],
  /* The stories load the table chunk before they render, as Play/Playing explains. */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/** What the page is shown of the room right now, in the ids it sends back. */
const shown = () => sandbox.table!.frame().snapshot;

/** A table piece as the page sees it, by what it is. */
const piece = (match: (candidate: { kind: string; stackKey?: string | null }) => boolean) =>
  shown().table.pieces.find((candidate) => !candidate.inventory && match(candidate))!;

/**
 * Opens at Bidding as seat 1, then plays on the live table: draws a Treachery card into the hand, carries a troop stack across the board, and moves to Revival from the page's own phase control.
 * Restarts at the end, so the story opens where the step does.
 */
export const Sandbox = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('complementary', { name: 'Sandbox' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    const table = sandbox.table!;
    const { room } = table;
    const faction = shown().bank!.factionId;

    /* A card from the Treachery deck lands in seat 1's hand. */
    const deck = piece((candidate) => candidate.stackKey === 'deck:treachery-deck');
    const handSize = shown().hand?.length ?? 0;
    table.receive({
      type: 'command',
      commandId: 'sandbox-draw',
      expectedRevision: room.snapshot.revision,
      action: { kind: 'deck-draw', pieceId: deck.id, recipient: faction },
    });
    await expect(table.refusal).toBeUndefined();
    await expect(shown().hand).toHaveLength(handSize + 1);
    await expect(piece((candidate) => candidate.stackKey === 'deck:treachery-deck').items).toHaveLength(
      deck.items.length - 1
    );

    /* Seat 1 carries one of its troop stacks across the board. */
    const troop = piece(
      (candidate) => candidate.kind === 'force' && !!candidate.stackKey?.startsWith(`troops:${faction}:`)
    );
    const target: [number, number, number] = [0, 0.4, 1.5];
    const versionBefore = shown().versions[troop.id]!;
    table.receive({
      type: 'begin',
      carryId: 'sandbox-carry',
      sourcePieceId: troop.id,
      expectedVersion: versionBefore,
      pickup: 'whole',
    });
    table.receive({
      type: 'drop',
      commandId: 'sandbox-drop',
      carryId: 'sandbox-carry',
      position: target,
      orientation: 0,
    });
    await expect(table.refusal).toBeUndefined();
    const moved = shown().table.pieces.find((candidate) => candidate.id === troop.id)!;
    await expect(moved.position).not.toEqual(troop.position);
    await expect(shown().versions[troop.id]).toBeGreaterThan(versionBefore);
    await expect(room.carries.size).toBe(0);

    /* The page's own Next phase reaches the room, which moves from Bidding to Revival. */
    const { controls, waitForPhase } = phaseControls(canvasElement);
    await openTab(page, 'Phase');
    await waitForPhase(() => expectHeaderPhase(canvasElement, 3));
    await userEvent.click(controls().getByRole('button', { name: 'Next phase' }));
    await waitFor(() => expect(room.snapshot.phase).toBe(4));
    await waitForPhase(() => expectHeaderPhase(canvasElement, 4));

    /* Restart puts the table back at Bidding. */
    await userEvent.click(page.getByRole('button', { name: 'Restart' }));
    await waitForPhase(() => expectHeaderPhase(canvasElement, 3));
    await expect(sandbox.table).not.toBe(table);
    await expect(shown().hand ?? []).toHaveLength(handSize);
  },
});

/**
 * Seat 1 peeks at the Treachery deck: its cards open top first, to it alone, for rearranging or pulling one out.
 * Every other seat's frame carries no peek and none of the deck's faces, only who peeked, under the deck's name.
 */
export const PeekAtTheDeck = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('complementary', { name: 'Sandbox' }, { timeout: 30_000 })).resolves.toBeVisible();
    const table = sandbox.table!;
    const faction = shown().bank!.factionId;
    const deck = piece((candidate) => candidate.stackKey === 'deck:treachery-deck');
    table.receive({
      type: 'command',
      commandId: 'sandbox-peek',
      expectedRevision: table.room.snapshot.revision,
      action: { kind: 'peek', pieceId: deck.id },
    });
    await expect(table.refusal).toBeUndefined();
    const view = await page.findByRole('dialog', { name: /^Peeking at / }, { timeout: 30_000 });
    await expect(within(view).getAllByRole('button', { name: 'Pull out' })).toHaveLength(deck.items.length);

    const other = journeyViewers().find((seat) => seat !== table.seat)!;
    const seen = table.frame(other).snapshot;
    await expect(seen.peek ?? null).toBeNull();
    const otherDeck = seen.table.pieces.find((candidate) => candidate.id === deck.id)!;
    await expect(otherDeck.items.every((item) => !item.artwork || !('front' in item.artwork))).toBe(true);
    await expect(otherDeck.items.every((item) => item.peekedBy?.includes(faction))).toBe(true);
  },
});

/**
 * Seat 1 pulls a card out of the Treachery deck while looking through it, closes the deck, and peeks at that one card: its face opens large, to seat 1 alone.
 */
export const PeekAtACard = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('complementary', { name: 'Sandbox' }, { timeout: 30_000 })).resolves.toBeVisible();
    const table = sandbox.table!;
    const deck = piece((candidate) => candidate.stackKey === 'deck:treachery-deck');
    const command = (
      commandId: string,
      action: Extract<Parameters<typeof table.receive>[0], { type: 'command' }>['action']
    ) => table.receive({ type: 'command', commandId, expectedRevision: table.room.snapshot.revision, action });
    command('sandbox-peek-deck', { kind: 'peek', pieceId: deck.id });
    command('sandbox-pull', { kind: 'peek-pull', pieceId: deck.id, index: deck.items.length - 1 });
    command('sandbox-close', { kind: 'peek-close' });
    const pulled = shown().table.pieces.find((candidate) => candidate.id.startsWith('pulled-'))!;
    command('sandbox-peek-card', { kind: 'peek', pieceId: pulled.id });
    await expect(table.refusal).toBeUndefined();
    const view = await page.findByRole('dialog', { name: /^Peeking at / }, { timeout: 30_000 });
    await expect(within(view).queryByRole('button', { name: 'Pull out' })).toBeNull();
  },
});

/**
 * Seat 1 deals a Treachery card onto the table, turns it face up and deletes it for good: it leaves the table for every seat and the log names it.
 * Right-click a card, token or stack and hold its "Hold to delete…" item to try it by hand;
 * faction tokens, markers and locked pieces cannot be deleted.
 */
export const DeleteACard = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('complementary', { name: 'Sandbox' }, { timeout: 30_000 })).resolves.toBeVisible();
    const table = sandbox.table!;
    const deck = piece((candidate) => candidate.stackKey === 'deck:treachery-deck');
    const command = (
      commandId: string,
      action: Extract<Parameters<typeof table.receive>[0], { type: 'command' }>['action']
    ) => table.receive({ type: 'command', commandId, expectedRevision: table.room.snapshot.revision, action });
    const before = new Set(shown().table.pieces.map((candidate) => candidate.id));
    command('sandbox-split', { kind: 'split', pieceId: deck.id, count: 1 });
    const card = shown().table.pieces.find((candidate) => !before.has(candidate.id))!;
    await expect(card.kind).toBe('card');
    command('sandbox-flip', { kind: 'flip', pieceId: card.id });
    command('sandbox-delete', { kind: 'delete', pieceId: card.id });
    await expect(table.refusal).toBeUndefined();
    const other = journeyViewers().find((seat) => seat !== table.seat)!;
    for (const seat of [table.seat, other]) {
      await expect(table.frame(seat).snapshot.table.pieces.some((candidate) => candidate.id === card.id)).toBe(false);
    }
    await expect(shown().table.events[0]?.message).toMatch(/deleted .* card from the game\.$/);
  },
});

/**
 * Seat 1 lifts the top card off the Treachery deck and turns it over in hand: every seat sees its face while it is held, and it lands face up with the flip in the table's events.
 * Pick up a card, token or troop stack and press F while still holding it to try it by hand;
 * markers and spice do not turn over.
 */
export const FlipWhileCarrying = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('complementary', { name: 'Sandbox' }, { timeout: 30_000 })).resolves.toBeVisible();
    const table = sandbox.table!;
    const deck = piece((candidate) => candidate.stackKey === 'deck:treachery-deck');
    const other = journeyViewers().find((seat) => seat !== table.seat)!;
    const position: [number, number, number] = [0, 0.4, 1.5];
    table.receive({
      type: 'begin',
      carryId: 'sandbox-flip',
      sourcePieceId: deck.id,
      expectedVersion: shown().versions[deck.id]!,
      pickup: 'top',
    });
    table.receive({ type: 'pose', carryId: 'sandbox-flip', seq: 1, position, orientation: 0 });
    table.receive({ type: 'flip', carryId: 'sandbox-flip', flips: 1 });
    await expect(table.refusal).toBeUndefined();
    const held = table.frame(other).carries[0]!.held;
    await expect(held.items[0]).toMatchObject({ faceUp: true, artwork: { front: expect.any(String) } });

    table.receive({
      type: 'drop',
      commandId: 'sandbox-flip-drop',
      carryId: 'sandbox-flip',
      position,
      orientation: 0,
      flips: 1,
    });
    await expect(table.refusal).toBeUndefined();
    const landed = table
      .frame(other)
      .snapshot.table.pieces.find((candidate) => candidate.items[0]?.id === held.items[0]!.id)!;
    await expect(landed.items[0]?.faceUp).toBe(true);
    await expect(
      shown()
        .table.events.slice(0, 2)
        .map((event) => event.command)
    ).toEqual(['deck.draw', 'piece.flip']);
  },
});

/**
 * Seat 1 lays a card from its hand in its hidden zone and a leader on top of it, as a token sits on a tracker card's track.
 * The zone is part of the hand, so no other seat's frame carries it.
 * Right-click a piece in the Hand tab and choose "Move to hidden zone" to try it by hand;
 * drag pieces about in the Hidden zone tab, or onto the table to play them.
 */
export const HiddenZone = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('complementary', { name: 'Sandbox' }, { timeout: 30_000 })).resolves.toBeVisible();
    const table = sandbox.table!;
    const command = (
      commandId: string,
      action: Extract<Parameters<typeof table.receive>[0], { type: 'command' }>['action']
    ) => table.receive({ type: 'command', commandId, expectedRevision: table.room.snapshot.revision, action });
    const hand = shown().hand!;
    const card = hand.find((candidate) => candidate.kind === 'card')!;
    const leader = hand.find((candidate) => candidate.kind === 'force')!;
    /* The leader stands in for a tracker marker: a token its author set to 35% of the standard size. */
    const faction = shown().bank!.factionId;
    const stored = table.room.snapshot.factionInventories[faction]!.find((candidate) => candidate.id === leader.id)!;
    stored.items[0]!.artwork = { ...stored.items[0]!.artwork!, size: 0.35 };
    command('sandbox-zone-card', { kind: 'hand-zone', pieceId: card.id, at: { x: 0.3, y: 0.5 } });
    command('sandbox-zone-leader', { kind: 'hand-zone', pieceId: leader.id, at: { x: 0.316, y: 0.36 } });
    await expect(table.refusal).toBeUndefined();
    await expect(shown().hand!.filter((candidate) => candidate.hiddenZone)).toHaveLength(2);
    const other = journeyViewers().find((seat) => seat !== table.seat)!;
    await expect(JSON.stringify(table.frame(other).snapshot)).not.toContain('hiddenZone');
    await openTab(page, 'Hidden zone');
    await expect(page.findAllByRole('button', { name: /in hidden zone$/ }, { timeout: 30_000 })).resolves.toHaveLength(
      2
    );
  },
});

/** The battle beacon at the Battle phase: pick the acrylic disc up over the tracker's Battle disc and drop it on a territory; it lies flat and fades as the battle shows. */
export const BattleBeacon = meta.story({ args: { step: chapter('Battle') } });

/**
 * The table between the controls and the players, the layout a viewer picks in the game menu;
 * the separators either side of the table resize the columns.
 * A window too narrow for the columns keeps the board on top.
 * Switching back and forth keeps the table's renderer and a half-typed message: the layouts move the same content, they never mount it afresh.
 */
export const ThreeColumns = meta.story({
  beforeEach: () => {
    setTableLayout('columns');
    return () => setTableLayout('stacked');
  },
  play: async ({ canvasElement }) => {
    const body = canvasElement.ownerDocument.body;
    const page = within(body);
    await expect(
      page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    const shell = () => body.querySelector<HTMLElement>('.dune-play-shell')!;
    await waitFor(() => expect(body.querySelector('.dune-play-stage[data-scene-ready="true"] canvas')).not.toBeNull(), {
      timeout: 30_000,
    });
    const fits = window.matchMedia(`(min-width: ${COLUMNS_MIN_WIDTH_REM}rem)`).matches;
    await expect(shell().dataset.tableLayout).toBe(fits ? 'columns' : 'stacked');
    if (fits) {
      await expect(page.getByRole('separator', { name: 'Resize controls column' })).toBeVisible();
      await expect(page.getByRole('separator', { name: 'Resize players column' })).toBeVisible();
    }
    const canvas = body.querySelector('canvas');
    const message = (await page.findByPlaceholderText('Message')) as HTMLTextAreaElement;
    await userEvent.type(message, 'half typed');

    for (const [choice, layout] of [
      ['Board on top', 'stacked'],
      ['Three columns', fits ? 'columns' : 'stacked'],
    ] as const) {
      await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
      await userEvent.click(await page.findByRole('menuitemradio', { name: choice }));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(shell().dataset.tableLayout).toBe(layout));
      await expect(body.querySelector('canvas')).toBe(canvas);
      await expect(page.getByPlaceholderText('Message')).toHaveValue('half typed');
    }

    /* A layout change while typing, as when the window crosses the columns' width, moves the composer without blurring or refocusing it. */
    message.focus();
    message.setSelectionRange(2, 6, 'backward');
    const focusChanges: string[] = [];
    const count = (event: FocusEvent) => focusChanges.push(event.type);
    message.addEventListener('focus', count);
    message.addEventListener('blur', count);
    setTableLayout('stacked');
    await waitFor(() => expect(shell().dataset.tableLayout).toBe('stacked'));
    await expect(body.ownerDocument.activeElement).toBe(message);
    await expect([message.selectionStart, message.selectionEnd, message.selectionDirection]).toEqual([
      2,
      6,
      'backward',
    ]);
    await expect(focusChanges).toEqual([]);
    message.removeEventListener('focus', count);
    message.removeEventListener('blur', count);
  },
});
