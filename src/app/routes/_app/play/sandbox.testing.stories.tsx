import { PLAY_DEBUGGER_EVENTS } from '@sb/playDebugger/events';
import { testingPreview } from '@sb/preview';
import { addons } from 'storybook/preview-api';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { chapter, journeyViewers, JourneyPage } from './journey.stories.fixture';
import { expectHeaderPhase, openTab, phaseControls } from './playing.stories.fixture';
import { sandbox, sandboxReady, sandboxSteps, sandboxTransport } from './sandbox.stories.fixture';
import { shown, piece } from './sandbox.stories.fixture';

const meta = testingPreview.meta({
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
    docs: {
      description: {
        component:
          "The game Worker's own table running in the browser, started from the room's stored state at a step of Play/Journey (J13 onwards). Drag pieces, draw cards, change phases and fight battles as any seat; the Play debugger panel switches seats and restarts the table. Drafting, seats, votes, the result and the log stay as recorded.",
      },
    },
  },
  beforeEach: ({ args }) =>
    install(() => sandboxTransport({ start: Number(args.step ?? 1) - 1, seat: String(args.seat ?? 'seat-1') }))(),
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/**
 * Opens at Bidding as seat 1, then plays on the live table: draws a Treachery card into the hand, carries a troop stack across the board, and moves to Revival from the page's own phase control.
 * Restarts at the end, so the story opens where the step does.
 */
export const Sandbox = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
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

    /* Restart, from the Play debugger panel, puts the table back at Bidding. */
    addons.getChannel().emit(PLAY_DEBUGGER_EVENTS.act, 'restart');
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
    await sandboxReady(page);
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
    await sandboxReady(page);
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
    await sandboxReady(page);
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
 * Seat 1 lays a card from its hand in its hidden zone and a leader on top of it, as a token sits on a tracker card's track.
 * The zone is part of the hand, so no other seat's frame carries it.
 * Right-click a piece in the Hand tab and choose "Move to hidden zone" to try it by hand;
 * drag pieces about in the Hidden zone tab, or onto the table to play them.
 * Hold Alt over a piece in either tab to see it close up.
 */
export const HiddenZone = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await sandboxReady(page);
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
    const zonePieces = await page.findAllByRole('button', { name: /in hidden zone$/ }, { timeout: 30_000 });
    await expect(zonePieces).toHaveLength(2);

    /*
     * Holding Alt over a piece in the zone, or in the hand, shows its face large beside the pointer, as it does on the table.
     * The card is the recording's Traitor stand-in, with no published face to show, so the leader shows it.
     */
    const closeUp = () => canvasElement.ownerDocument.body.querySelector('[class*="closeUp"]');
    /* The pointer's own events carry Alt, as a real mouse's do while it is held. */
    const point = (target: Element, type: string) => {
      const bounds = target.getBoundingClientRect();
      const at = { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 };
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, altKey: true, pointerType: 'mouse', ...at }));
    };
    const zoneLeader = page.getByRole('button', {
      name: `Drag ${leader.items[0]?.artwork?.name ?? leader.label} in hidden zone`,
    });
    point(zoneLeader, 'pointerover');
    point(zoneLeader, 'pointermove');
    await waitFor(() => expect(closeUp()).not.toBeNull());
    point(zoneLeader, 'pointerout');
    await waitFor(() => expect(closeUp()).toBeNull());
    await openTab(page, 'Hand');
    const handPiece = (await page.findAllByRole('button', { name: /from hand$/ }, { timeout: 30_000 }))[0]!;
    point(handPiece, 'pointerover');
    point(handPiece, 'pointermove');
    await waitFor(() => expect(closeUp()).not.toBeNull());
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', altKey: false }));
    await waitFor(() => expect(closeUp()).toBeNull());
  },
});

/** The battle beacon at the Battle phase: pick the acrylic disc up over the tracker's Battle disc and drop it on a territory; it lies flat and fades as the battle shows. */
export const BattleBeacon = meta.story({
  args: { step: chapter('Battle') },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('button', { name: 'Drag battle marker onto territory' }, { timeout: 30_000 })
    ).resolves.toBeInTheDocument();
  },
});
