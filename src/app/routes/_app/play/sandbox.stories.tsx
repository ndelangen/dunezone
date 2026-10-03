import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { chapter, journeyViewers, JourneyPage } from './journey.stories.fixture';
import { expectHeaderPhase, openTab, phaseControls } from './playing.stories.fixture';
import { sandbox, sandboxDecorator, sandboxSteps, sandboxTransport } from './sandbox.stories.fixture';

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
    expect(table.refusal).toBeUndefined();
    expect(shown().hand).toHaveLength(handSize + 1);
    expect(piece((candidate) => candidate.stackKey === 'deck:treachery-deck').items).toHaveLength(
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
    expect(table.refusal).toBeUndefined();
    const moved = shown().table.pieces.find((candidate) => candidate.id === troop.id)!;
    expect(moved.position).not.toEqual(troop.position);
    expect(shown().versions[troop.id]).toBeGreaterThan(versionBefore);
    expect(room.carries.size).toBe(0);

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
    expect(sandbox.table).not.toBe(table);
    expect(shown().hand ?? []).toHaveLength(handSize);
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
    expect(table.refusal).toBeUndefined();
    const view = await page.findByRole('dialog', { name: /^Peeking at / }, { timeout: 30_000 });
    expect(within(view).getAllByRole('button', { name: 'Pull out' })).toHaveLength(deck.items.length);

    const other = journeyViewers().find((seat) => seat !== table.seat)!;
    const seen = table.frame(other).snapshot;
    expect(seen.peek ?? null).toBeNull();
    const otherDeck = seen.table.pieces.find((candidate) => candidate.id === deck.id)!;
    expect(otherDeck.items.every((item) => !item.artwork || !('front' in item.artwork))).toBe(true);
    expect(otherDeck.items.every((item) => item.peekedBy?.includes(faction))).toBe(true);
  },
});

/**
 * Seat 1 pulls a card out of the Treachery deck while looking through it, closes the deck, and peeks at that one card:
 * its face opens large, to seat 1 alone.
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
    expect(table.refusal).toBeUndefined();
    const view = await page.findByRole('dialog', { name: /^Peeking at / }, { timeout: 30_000 });
    expect(within(view).queryByRole('button', { name: 'Pull out' })).toBeNull();
  },
});
