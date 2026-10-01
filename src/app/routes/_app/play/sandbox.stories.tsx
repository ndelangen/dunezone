import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { journeySteps, journeyViewers, JourneyPage } from './journey.stories.fixture';
import { expectHeaderPhase, openTab, phaseControls } from './playing.stories.fixture';
import { sandbox, sandboxDecorator, sandboxSteps, sandboxTransport } from './sandbox.stories.fixture';

/* The 1-based step of the first recorded step with this title, so a re-recording keeps the story on its moment. */
const chapter = (title: string) => {
  const index = journeySteps().findIndex((step) => step.title === title);
  if (index < 0) {
    throw new Error(`The journey recording has no step titled ${title}.`);
  }
  return index + 1;
};

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
    install(() => sandboxTransport(Number(args.step ?? 1) - 1, String(args.seat ?? 'seat-1')))(),
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
 * Opens at Bidding as seat 1, then plays on the live table: draws a Treachery card into the hand, carries a force stack across the board, and moves to Revival from the page's own phase control.
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

    /* Seat 1 carries one of its force stacks across the board. */
    const force = piece(
      (candidate) => candidate.kind === 'force' && !!candidate.stackKey?.startsWith(`troops:${faction}:`)
    );
    const target: [number, number, number] = [0, 0.4, 1.5];
    table.receive({
      type: 'begin',
      carryId: 'sandbox-carry',
      sourcePieceId: force.id,
      expectedVersion: shown().versions[force.id]!,
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
    const moved = shown().table.pieces.find((candidate) => candidate.id === force.id)!;
    expect(moved.position[0]).toBeCloseTo(target[0], 0);
    expect(moved.position[2]).toBeCloseTo(target[2], 0);
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
