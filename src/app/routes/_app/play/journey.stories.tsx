import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { gameMeta } from './game.stories.fixture';
import { chapter, JourneyPage, journeySteps, journeyBeforeEach, journeyViewers } from './journey.stories.fixture';
import { atStep } from './journey.stories.fixture';

const meta = preview.meta({
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

/** Seat 2 has drafted House Harkonnen and can still search for a faction to ban. */
export const Drafting = meta.story({
  args: { step: chapter('Draft ban'), seat: 'seat-2' },
  play: async ({ canvasElement }) => {
    const { page } = await atStep(canvasElement, chapter('Draft ban'));
    await expect(page.findByRole('textbox', { name: 'Search factions' })).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove House Harkonnen from your draft' })).toBeVisible();
  },
});

/** Trading runs on a clock, and the viewer can offer a trade to another faction. */
export const Trading = meta.story({
  args: { step: chapter('Trading') },
  play: async ({ canvasElement }) => {
    const { page } = await atStep(canvasElement, chapter('Trading'));
    await expect(page.findByRole('timer', { name: 'Trading time remaining' })).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Offer trade to House Atreides' })).toBeVisible();
  },
});

/** Every faction is listed for placing its starting troops. */
export const StartingTroops = meta.story({
  args: { step: chapter('Setup complete') },
  play: async ({ canvasElement }) => {
    const { page } = await atStep(canvasElement, chapter('Setup complete'));
    const troops = within(await page.findByRole('region', { name: 'Starting troops' }));
    for (const faction of [
      'Bene Gesserit',
      'House Atreides',
      'Fremen',
      'House Harkonnen',
      'Spacing Guild',
      'Emperor',
    ]) {
      await expect(troops.getByRole('heading', { name: faction })).toBeVisible();
    }
  },
});

/** The last step declares the result. */
export const Finished = meta.story({
  args: { step: journeySteps().length },
  play: async ({ canvasElement }) => {
    const { page } = await atStep(canvasElement, journeySteps().length);
    await expect(page.findByRole('heading', { name: 'House Atreides won' })).resolves.toBeVisible();
  },
});
