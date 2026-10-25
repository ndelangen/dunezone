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
 * Right-click a piece in the Hand tab and choose "Move to private side-table" to try it by hand;
 * carry pieces about on the Private side-table, or onto the table to play them.
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
    const card = hand.find((candidate) => candidate.stackKey === 'cards:traitor')!;
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
    await openTab(page, 'Private side-table');
    const zonePieces = await page.findAllByRole('button', { name: /on private side-table$/ }, { timeout: 30_000 });
    await expect(zonePieces).toHaveLength(2);

    /* Carrying the leader moves the piece itself under the pointer, and letting go lays it there. */
    const leaderName = `Move ${leader.items[0]?.artwork?.name ?? leader.label} on private side-table`;
    let zoneLeader = page.getByRole('button', { name: leaderName });
    const press = (type: string, clientX: number, clientY: number) =>
      zoneLeader.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 1,
          pointerType: 'mouse',
          button: 0,
          buttons: 1,
          clientX,
          clientY,
        })
      );
    const before = zoneLeader.getBoundingClientRect();
    const fromX = before.left + before.width / 2;
    const fromY = before.top + before.height / 2;
    const carried = () => canvasElement.ownerDocument.body.querySelector<HTMLElement>('[class*="carried"]');
    press('pointerdown', fromX, fromY);
    press('pointermove', fromX + 30, fromY);
    await waitFor(() => expect(carried()).not.toBeNull());
    const first = carried()!.getBoundingClientRect().left;
    press('pointermove', fromX + 60, fromY + 10);
    await waitFor(() => expect(carried()!.getBoundingClientRect().left).toBeCloseTo(first + 30, 0));
    const spotBefore = shown().hand!.find((candidate) => candidate.id === leader.id)!.hiddenZone!;
    press('pointerup', fromX + 60, fromY + 10);
    await waitFor(() => expect(carried()).toBeNull());
    await waitFor(() =>
      expect(shown().hand!.find((candidate) => candidate.id === leader.id)!.hiddenZone!.x).toBeGreaterThan(spotBefore.x)
    );
    await waitFor(() => expect(zoneLeader.getBoundingClientRect().left).toBeCloseTo(before.left + 60, 0));

    /* Escape puts a carried piece back where it was, and the release that follows sends nothing. */
    const kept = () => shown().hand!.find((candidate) => candidate.id === leader.id)!.hiddenZone!;
    const resting = zoneLeader.getBoundingClientRect();
    const restX = resting.left + resting.width / 2;
    const restY = resting.top + resting.height / 2;
    const keptBefore = kept();
    press('pointerdown', restX, restY);
    press('pointermove', restX + 40, restY);
    await waitFor(() => expect(carried()).not.toBeNull());
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => expect(carried()).toBeNull());
    press('pointerup', restX + 40, restY);
    await expect(kept()).toEqual(keptBefore);
    await expect(zoneLeader.getBoundingClientRect().left).toBeCloseTo(resting.left, 0);

    /* Leaving the window puts a carried piece back too, so a release it never saw moves nothing. */
    press('pointerdown', restX, restY);
    press('pointermove', restX + 40, restY);
    await waitFor(() => expect(carried()).not.toBeNull());
    window.dispatchEvent(new FocusEvent('blur'));
    await waitFor(() => expect(carried()).toBeNull());
    press('pointerup', restX + 40, restY);
    await expect(kept()).toEqual(keptBefore);

    /* A move the table refuses puts the piece back where the table keeps it. */
    const receive = table.receive.bind(table);
    table.receive = (message, seat) => {
      if (message.type === 'command' && message.action.kind === 'hand-zone') {
        table.deliver({ type: 'rejected', requestId: message.commandId, message: 'Refused for the story.' });
        return true;
      }
      return receive(message, seat);
    };
    press('pointerdown', restX, restY);
    press('pointermove', restX + 40, restY);
    press('pointerup', restX + 40, restY);
    await waitFor(() => expect(zoneLeader.getBoundingClientRect().left).toBeCloseTo(resting.left, 0));
    table.receive = receive;
    await expect(kept()).toEqual(keptBefore);

    /* E turns the piece under the pointer clockwise in 15° steps, and the turn is kept once the key comes up. */
    const over = (type: string) =>
      zoneLeader.dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerType: 'mouse', clientX: restX, clientY: restY })
      );
    over('pointerover');
    over('pointermove');
    /* A pointer reaches the piece a frame or more before a key goes down. */
    await new Promise((settle) => requestAnimationFrame(settle));
    for (const type of ['keydown', 'keydown', 'keyup']) {
      window.dispatchEvent(new KeyboardEvent(type, { key: 'e', bubbles: true }));
    }
    await waitFor(() => expect(kept().turn).toBe(2));
    await waitFor(() => expect(zoneLeader.style.transform).toBe('rotate(30deg)'));
    /* The turn is kept even when the pointer leaves the piece before the key comes up. */
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
    over('pointerout');
    await new Promise((settle) => requestAnimationFrame(settle));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'q', bubbles: true }));
    await waitFor(() => expect(kept().turn).toBe(1));

    /* A turned piece is lifted from where it lies and laid where it is let go, without a jump. */
    const turnedBox = zoneLeader.getBoundingClientRect();
    const turnedX = turnedBox.left + turnedBox.width / 2;
    const turnedY = turnedBox.top + turnedBox.height / 2;
    press('pointerdown', turnedX, turnedY);
    press('pointermove', turnedX + 60, turnedY);
    await waitFor(() => expect(carried()).not.toBeNull());
    const liftedBox = carried()!.getBoundingClientRect();
    await expect(liftedBox.left + liftedBox.width / 2).toBeCloseTo(turnedX + 60, 0);
    press('pointerup', turnedX + 60, turnedY);
    const centreX = () => {
      const box = zoneLeader.getBoundingClientRect();
      return box.left + box.width / 2;
    };
    await waitFor(() => expect(centreX()).toBeCloseTo(turnedX + 60, 0));
    await expect(kept().turn).toBe(1);

    /* A turn's key that comes up while Alt is held for a close look still sends the turn. */
    over('pointerover');
    over('pointermove');
    await new Promise((settle) => requestAnimationFrame(settle));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: '´', code: 'KeyE', altKey: true, bubbles: true }));
    await waitFor(() => expect(kept().turn).toBe(2));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'q', bubbles: true }));
    await waitFor(() => expect(kept().turn).toBe(1));

    /* Picking a piece up takes focus from a text field, so Q and E turn the carried piece instead of typing. */
    const field = canvasElement.ownerDocument.createElement('textarea');
    canvasElement.ownerDocument.body.append(field);
    field.focus();
    const fieldBox = zoneLeader.getBoundingClientRect();
    const fieldX = fieldBox.left + fieldBox.width / 2;
    const fieldY = fieldBox.top + fieldBox.height / 2;
    press('pointerdown', fieldX, fieldY);
    press('pointermove', fieldX + 30, fieldY);
    await waitFor(() => expect(carried()).not.toBeNull());
    await expect(canvasElement.ownerDocument.activeElement).toBe(zoneLeader);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    press('pointerup', fieldX + 30, fieldY);
    await waitFor(() => expect(kept().turn).toBe(2));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e', bubbles: true }));
    field.remove();
    over('pointerover');
    over('pointermove');
    await new Promise((settle) => requestAnimationFrame(settle));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'q', bubbles: true }));
    await waitFor(() => expect(kept().turn).toBe(1));

    /* Leaving the window while Q is held sends the turn it shows, since the key comes up elsewhere. */
    over('pointerover');
    over('pointermove');
    await new Promise((settle) => requestAnimationFrame(settle));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
    window.dispatchEvent(new FocusEvent('blur'));
    await waitFor(() => expect(kept().turn).toBeUndefined());
    over('pointerout');

    /* Holding Alt over a piece in the zone, or in the hand, shows its face large beside the pointer, as it does on the table. */
    const closeUp = () => canvasElement.ownerDocument.body.querySelector('[class*="closeUp"]');
    /* The pointer's own events carry Alt, as a real mouse's do while it is held. */
    const point = (target: Element, type: string) => {
      const bounds = target.getBoundingClientRect();
      const at = { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 };
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, altKey: true, pointerType: 'mouse', ...at }));
    };
    for (const zonePiece of zonePieces) {
      point(zonePiece, 'pointerover');
      point(zonePiece, 'pointermove');
      await waitFor(() => expect(closeUp()).not.toBeNull());
      point(zonePiece, 'pointerout');
      await waitFor(() => expect(closeUp()).toBeNull());
    }
    await openTab(page, 'Hand');
    const handPiece = (await page.findAllByRole('button', { name: /from hand$/ }, { timeout: 30_000 }))[0]!;
    point(handPiece, 'pointerover');
    point(handPiece, 'pointermove');
    await waitFor(() => expect(closeUp()).not.toBeNull());
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', altKey: false }));
    await waitFor(() => expect(closeUp()).toBeNull());

    /* Carried out of the zone and let go over the table, the leader is played there, as a drag from the hand plays it. */
    await openTab(page, 'Private side-table');
    /* The zone drew its pieces afresh when its tab came back. */
    zoneLeader = await page.findByRole('button', { name: leaderName }, { timeout: 30_000 });
    const start = zoneLeader.getBoundingClientRect();
    /* The spot nearest the table's centre that no window covers, whatever the viewport: a window may sit over the centre. */
    const canvasNode = canvasElement.ownerDocument.querySelector('canvas')!;
    const canvas = canvasNode.getBoundingClientRect();
    const spots = Array.from({ length: 81 }, (_, index) => [
      canvas.left + (canvas.width * (1 + (index % 9))) / 10,
      canvas.top + (canvas.height * (1 + Math.floor(index / 9))) / 10,
    ]);
    const fromCentre = ([x, y]: number[]) =>
      Math.hypot(x! - canvas.left - canvas.width / 2, y! - canvas.top - canvas.height / 2);
    spots.sort((a, b) => fromCentre(a) - fromCentre(b));
    const overTable = spots.find(([x, y]) => canvasElement.ownerDocument.elementFromPoint(x!, y!) === canvasNode)!;
    await expect(overTable, 'no spot of the table is left uncovered').toBeDefined();
    press('pointerdown', start.left + start.width / 2, start.top + start.height / 2);
    press('pointermove', overTable[0]!, overTable[1]!);
    press('pointerup', overTable[0]!, overTable[1]!);
    await waitFor(() => expect(shown().hand!.some((candidate) => candidate.id === leader.id)).toBe(false));
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
