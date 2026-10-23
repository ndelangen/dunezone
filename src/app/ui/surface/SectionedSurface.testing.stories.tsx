import { testingPreview } from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { SectionedSurface } from './SectionedSurface';
import { rows } from './SectionedSurface.stories.fixture';

const meta = testingPreview.meta({
  title: 'Sectioned Surface',
  component: SectionedSurface,
  parameters: { layout: 'padded' },
  args: { children: rows(3) },
});

const activations = [fn(), fn(), fn()];

/** Activatable rows: the whole row is the target. Tab to one and press Enter. */
export const ActivatableRows = meta.story({
  args: {
    children: rows(3, (index) => ({ onActivate: activations[index], ariaLabel: `Open row ${index + 1}` })),
  },
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await userEvent.tab();
    await expect(within(canvasElement).getByRole('link', { name: 'Open row 2' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(activations[1]).toHaveBeenCalledOnce();
    await expect(activations[0]).not.toHaveBeenCalled();
  },
});
