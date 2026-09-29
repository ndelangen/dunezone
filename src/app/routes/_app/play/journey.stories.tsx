import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import {
  journey,
  journeyDecorator,
  JourneyPage,
  journeySteps,
  journeyTransport,
  journeyViewers,
  stepCode,
} from './journey.stories.fixture';

/* The 1-based step of the first recorded step with this title, so a re-recording keeps each chapter on its moment. */
const chapter = (title: string) => {
  const index = journeySteps().findIndex((step) => step.title === title);
  if (index < 0) {
    throw new Error(`The journey recording has no step titled ${title}.`);
  }
  return index + 1;
};

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
  beforeEach: ({ args }) =>
    install(() => journeyTransport(Number(args.step ?? 1) - 1, String(args.seat ?? 'seat-1')))(),
  decorators: [...gameMeta.decorators, journeyDecorator],
  /* The stories load the table chunk before they render, as Play/Playing explains. */
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
    expect(panel.getByText(journeySteps()[0]!.title)).toBeVisible();
    /* The page itself follows the panel: the second player shows once the table fills, and leaves again at the start. */
    const seated = () => page.queryAllByText(PLAYERS_AT_TABLE_FULL, { exact: true });
    expect(seated()).toHaveLength(0);
    await userEvent.click(panel.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(panel.getByText(stepCode(1))).toBeVisible());
    expect(journey.step).toBe(1);
    await waitFor(() => expect(seated().length).toBeGreaterThan(0));
    /* Back to the start, so the story opens where the game does. */
    await userEvent.click(panel.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(panel.getByText(stepCode(0))).toBeVisible());
    await waitFor(() => expect(seated()).toHaveLength(0));
  },
});

export const Drafting = meta.story({
  args: { step: chapter('Draft ban'), seat: 'seat-2' },
  play: async ({ canvasElement }) => {
    await atStep(canvasElement, chapter('Draft ban'));
  },
});

export const Trading = meta.story({
  args: { step: chapter('Trading') },
  play: async ({ canvasElement }) => {
    await atStep(canvasElement, chapter('Trading'));
  },
});

export const TraitorsDealt = meta.story({
  args: { step: chapter('Traitors dealt') },
  play: async ({ canvasElement }) => {
    await atStep(canvasElement, chapter('Traitors dealt'));
  },
});

export const StartingForces = meta.story({
  args: { step: chapter('Setup complete') },
  play: async ({ canvasElement }) => {
    await atStep(canvasElement, chapter('Setup complete'));
  },
});

export const SpiceBlow = meta.story({
  args: { step: chapter('Spice placed') },
  play: async ({ canvasElement }) => {
    await atStep(canvasElement, chapter('Spice placed'));
  },
});

export const BattleRevealed = meta.story({
  args: { step: chapter('Battle revealed'), seat: 'neutral' },
  play: async ({ canvasElement }) => {
    await atStep(canvasElement, chapter('Battle revealed'));
  },
});

export const Finished = meta.story({
  args: { step: journeySteps().length },
  play: async ({ canvasElement }) => {
    await atStep(canvasElement, journeySteps().length);
  },
});
