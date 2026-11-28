import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { declaringArgs, determiningSnapshot, resultArgs, resultPanelMeta } from './ResultPanel.stories.fixture';

const meta = testingPreview.meta({ ...resultPanelMeta, title: 'Play/Panels/Result' });

/** Each choice reports its change; with a valid choice Declare declares it, and Stop ends the sequence. */
export const Declares = meta.story({
  args: declaringArgs({ kind: 'none', faction: null, alliance: [] }),
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByText('Alliance'));
    await expect(args.onChange).toHaveBeenCalledWith({ kind: 'alliance' });
    await userEvent.click(canvas.getByRole('button', { name: 'Declare' }));
    await expect(args.onDeclare).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Stop' }));
    await expect(args.onStop).toHaveBeenCalledOnce();
  },
});

/** Reveal prediction reveals the viewer's locked prediction. */
export const Reveals = meta.story({
  args: resultArgs(determiningSnapshot('seat-1', 'seat-2', {})),
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Reveal prediction' }));
    await expect(args.onReveal).toHaveBeenCalledOnce();
  },
});
