import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { openControl } from './controls.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import {
  chapter,
  journey,
  journeyDecorator,
  JourneyPage,
  journeySteps,
  journeyTransport,
  journeyViewers,
  stepCode,
} from './journey.stories.fixture';
import { atStep } from './journey.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Journey',
  component: JourneyPage,
  args: { ...gameMeta.args, step: 1, seat: 'seat-1' },
  argTypes: {
    step: { control: { type: 'range', min: 1, max: journeySteps().length, step: 1 } },
    seat: { control: 'select', options: journeyViewers() },
  },
  parameters: {
    ...gameMeta.parameters,
    controls: { disable: false, include: ['step', 'seat'] },
    docs: {
      description: {
        component:
          'One real six-seat game recorded from the game Worker, replayed step by step. The panel moves between steps, switches the seat the page is viewed as, and names each step (J01, J02) for feedback. Record it again with `bun run play:record`.',
      },
    },
  },
  beforeEach: ({ args }) => {
    /* Storybook runs this again on every argument change without unmounting the page, so the page keeps the transport it connected to and the panel delivers the new step there. */
    if (journey.transport?.connected()) {
      return;
    }
    return install(() => journeyTransport(Number(args.step ?? 1) - 1, String(args.seat ?? 'seat-1')))();
  },
  decorators: [...gameMeta.decorators, journeyDecorator],
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/* The second seat's player, who joins between J01 and J02. */
const PLAYERS_AT_TABLE_FULL = 'Thialfi';

/** The whole game: start at J01 and step, scrub or switch seats from the panel. */
export const Walkthrough = meta.story({
  play: async ({ canvasElement }) => {
    const { page, panel } = await atStep(canvasElement, 1);
    await expect(panel.getByText(journeySteps()[0]!.title)).toBeVisible();
    /* The page itself follows the panel: the second player's token joins the chat bar once the table fills, and leaves again at the start. */
    const seated = () => page.queryAllByRole('button', { name: new RegExp(`^${PLAYERS_AT_TABLE_FULL}`) });
    await expect(seated()).toHaveLength(0);
    await userEvent.click(panel.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(panel.getByText(stepCode(1))).toBeVisible());
    await expect(journey.step).toBe(1);
    await waitFor(() => expect(seated().length).toBeGreaterThan(0));
    /* Back to the start, so the story opens where the game does. */
    await userEvent.click(panel.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(panel.getByText(stepCode(0))).toBeVisible());
    await waitFor(() => expect(seated()).toHaveLength(0));
  },
});

/** The Bene Gesserit hand now holds traitor cards for other factions' leaders beside its own. */
export const TraitorsDealt = meta.story({
  args: { step: chapter('Traitors dealt') },
  play: async ({ canvasElement }) => {
    const { page } = await atStep(canvasElement, chapter('Traitors dealt'));
    await openControl(page, 'Setup');
    await expect(page.findByRole('region', { name: 'Traitor selection' })).resolves.toBeVisible();
    await openControl(page, 'Hand');
    const hand = within(await page.findByRole('region', { name: 'Your hand and leaders' }));
    for (const traitor of ['Thufir Hawat', 'Esmar Tuek', 'Hasimir Fenring']) {
      await expect(hand.getByRole('button', { name: `Drag ${traitor} from hand` })).toBeInTheDocument();
    }
  },
});

/** The game log records the spice the blow put on the table. */
export const SpiceBlow = meta.story({
  args: { step: chapter('Spice placed') },
  play: async ({ canvasElement }) => {
    const { page } = await atStep(canvasElement, chapter('Spice placed'));
    await openControl(page, 'Game log');
    const log = within(await page.findByRole('region', { name: 'Game log' }));
    await expect(log.findByText('Twaffle took 8 spice from the Spice Bank to the table.')).resolves.toBeVisible();
  },
});

/** A spectator sees both battle plans revealed and the outcome calls. */
export const BattleRevealed = meta.story({
  args: { step: chapter('Battle revealed'), seat: 'neutral' },
  play: async ({ canvasElement }) => {
    const { page } = await atStep(canvasElement, chapter('Battle revealed'));
    await openControl(page, 'Battle');
    await waitFor(() => expect(page.getAllByLabelText(/ plan, troop strength/).length).toBeGreaterThanOrEqual(2));
    await expect(page.getByRole('button', { name: 'Left side won' })).toBeVisible();
  },
});
