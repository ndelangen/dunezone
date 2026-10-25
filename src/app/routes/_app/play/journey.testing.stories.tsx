import { testingPreview } from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { openControl } from './controls.stories.fixture';
import { gameMeta } from './game.stories.fixture';
import {
  chapter,
  journey,
  JourneyPage,
  journeySteps,
  journeyBeforeEach,
  journeyViewers,
  showJourney,
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
    docs: {
      description: {
        component:
          'One real six-seat game recorded from the game Worker, replayed step by step. The Play debugger panel moves between steps, switches the seat the page is viewed as, and names each step (J01, J02) for feedback. Record it again with `bun run play:record`.',
      },
    },
  },
  beforeEach: journeyBeforeEach,
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/* The second seat's player, who joins between J01 and J02. */
const PLAYERS_AT_TABLE_FULL = 'Thialfi';

/** The whole game: start at J01 and step through it from the Play debugger panel; the canvas holds the page alone. */
export const Walkthrough = meta.story({
  play: async ({ canvasElement }) => {
    const { page } = await atStep(canvasElement, 1);
    /* No story controls sit over the page: the debugger lives in Storybook's own panel. */
    await expect(page.queryByRole('complementary', { name: 'Journey' })).toBeNull();
    /* The page itself follows the step: the second player's token joins the chat bar once the table fills, and leaves again at the start. */
    const seated = () => page.queryAllByRole('button', { name: new RegExp(`^${PLAYERS_AT_TABLE_FULL}`) });
    await expect(seated()).toHaveLength(0);
    /* The Play debugger panel moves the step argument; the story's `beforeEach` then delivers it like this. */
    showJourney(1, 'seat-1');
    await waitFor(() => expect(journey.step).toBe(1));
    await waitFor(() => expect(seated().length).toBeGreaterThan(0));
    /* Back to the start, so the story opens where the game does. */
    showJourney(0, 'seat-1');
    await waitFor(() => expect(journey.step).toBe(0));
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
