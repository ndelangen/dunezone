import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { inSetupWindow, predicting, predictionLocked, setupArgs, setupPanelMeta } from './SetupPanel.stories.fixture';

const meta = testingPreview.meta({ ...setupPanelMeta, title: 'Play/Panels/Setup' });

/** Gather tabletop traitors gathers them. */
export const GathersTraitors = meta.story({
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Gather tabletop traitors' }));
    await expect(args.onGatherTraitors).toHaveBeenCalledOnce();
  },
});

/** Picking a winner unlocks Lock prediction, which locks the winner and the turn. */
export const LocksAPrediction = meta.story({
  args: setupArgs(predicting(), 'seat-6'),
  parameters: inSetupWindow(predicting()),
  play: async ({ args, canvas, canvasElement }) => {
    const [first] = predicting().roster!.seats;
    await userEvent.click(canvas.getByRole('combobox', { name: 'Predicted winner' }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('option', { name: first!.faction!.name }));
    await userEvent.click(canvas.getByRole('button', { name: 'Lock prediction' }));
    await expect(args.onLockPrediction).toHaveBeenCalledWith('prediction', { factionId: first!.faction!.id, turn: 1 });
  },
});

/** Reveal prediction reveals the viewer's locked prediction. */
export const RevealsAPrediction = meta.story({
  args: setupArgs(predictionLocked(), 'seat-6'),
  parameters: inSetupWindow(predictionLocked()),
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Reveal prediction' }));
    await expect(args.onRevealPrediction).toHaveBeenCalledWith('prediction');
  },
});
