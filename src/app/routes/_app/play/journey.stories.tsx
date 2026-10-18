import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

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

/** Waits for the journey panel to name the step, then for the connected page behind it. */
async function atStep(canvasElement: HTMLElement, step: number) {
  const page = within(canvasElement.ownerDocument.body);
  const panel = await page.findByRole('complementary', { name: 'Journey' }, { timeout: 30_000 });
  await waitFor(() => expect(within(panel).getByText(stepCode(step - 1))).toBeVisible(), { timeout: 30_000 });
  await expect(
    page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
  ).resolves.toBeVisible();
  return { page, panel: within(panel) };
}

/* The second seat's player, who joins between J01 and J02. */
const PLAYERS_AT_TABLE_FULL = 'Thialfi';

/** The whole game: start at J01 and step, scrub or switch seats from the panel. */
export const Walkthrough = meta.story({
  play: async ({ canvasElement }) => {
    const { page, panel } = await atStep(canvasElement, 1);
    await expect(panel.getByText(journeySteps()[0]!.title)).toBeVisible();
    /* The page itself follows the panel: the second player shows once the table fills, and leaves again at the start. */
    const seated = () => page.queryAllByText(PLAYERS_AT_TABLE_FULL, { exact: true });
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

/** Opens a tab of the controls panel, which the recorded step may draw a moment after its heading. */
async function openTab(page: ReturnType<typeof within>, name: string) {
  await userEvent.click(await page.findByRole('tab', { name }, { timeout: 30_000 }));
}

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

/** The Bene Gesserit hand now holds traitor cards for other factions' leaders beside its own. */
export const TraitorsDealt = meta.story({
  args: { step: chapter('Traitors dealt') },
  play: async ({ canvasElement }) => {
    const { page } = await atStep(canvasElement, chapter('Traitors dealt'));
    await expect(page.findByRole('region', { name: 'Traitor selection' })).resolves.toBeVisible();
    await openTab(page, 'Yours');
    const hand = within(await page.findByRole('region', { name: 'Your hand and leaders' }));
    for (const traitor of ['Thufir Hawat', 'Esmar Tuek', 'Hasimir Fenring']) {
      await expect(hand.getByRole('button', { name: `Drag ${traitor} from hand` })).toBeInTheDocument();
    }
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

/** The game log records the spice the blow put on the table. */
export const SpiceBlow = meta.story({
  args: { step: chapter('Spice placed') },
  play: async ({ canvasElement }) => {
    const { page } = await atStep(canvasElement, chapter('Spice placed'));
    await openTab(page, 'History');
    const log = within(await page.findByRole('region', { name: 'Game log' }));
    await expect(log.findByText('Twaffle took 8 spice from the Spice Bank to the table.')).resolves.toBeVisible();
  },
});

/** A spectator sees both battle plans revealed and the outcome calls. */
export const BattleRevealed = meta.story({
  args: { step: chapter('Battle revealed'), seat: 'neutral' },
  play: async ({ canvasElement }) => {
    const { page } = await atStep(canvasElement, chapter('Battle revealed'));
    await expect(page.findByRole('region', { name: 'Battle' })).resolves.toBeVisible();
    await waitFor(() => expect(page.getAllByLabelText(/ plan, troop strength/).length).toBeGreaterThanOrEqual(2));
    await expect(page.getByRole('button', { name: 'Left side won' })).toBeVisible();
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
