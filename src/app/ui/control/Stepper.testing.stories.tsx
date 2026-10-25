import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { stepperMeta } from './Stepper.stories.fixture';

const meta = testingPreview.meta({ ...stepperMeta, title: 'Stepper' });

/** Stepping, a typed value past the limit, a key stepping from what was typed, and a count past the limit kept on blur. */
export const Stepping = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'More: Spice to withdraw' }));
    await expect(page.getByRole('textbox', { name: 'Spice to withdraw' })).toHaveValue('2');
    /* Typed past the limit, it settles on the limit. */
    await userEvent.clear(page.getByRole('textbox', { name: 'Spice to withdraw' }));
    await userEvent.type(page.getByRole('textbox', { name: 'Spice to withdraw' }), '9{Enter}');
    await expect(page.getByRole('textbox', { name: 'Spice to withdraw' })).toHaveValue('5');
    /* A key steps from what was typed, not from the value before it. */
    await userEvent.clear(page.getByRole('textbox', { name: 'Spice to withdraw' }));
    await userEvent.type(page.getByRole('textbox', { name: 'Spice to withdraw' }), '3{ArrowUp}');
    await expect(page.getByRole('textbox', { name: 'Spice to withdraw' })).toHaveValue('4');
    await userEvent.tab();
    await expect(page.getByRole('textbox', { name: 'Spice to withdraw' })).toHaveValue('4');
    /* Leaving the field keeps a count past the limit as typed, marked, and Escape drops it. */
    await userEvent.clear(page.getByRole('textbox', { name: 'Spice to withdraw' }));
    await userEvent.type(page.getByRole('textbox', { name: 'Spice to withdraw' }), '8');
    await userEvent.tab();
    await expect(page.getByRole('textbox', { name: 'Spice to withdraw' })).toHaveValue('8');
    await expect(page.getByRole('textbox', { name: 'Spice to withdraw' })).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(page.getByRole('textbox', { name: 'Spice to withdraw' }), '{Escape}');
    await expect(page.getByRole('textbox', { name: 'Spice to withdraw' })).toHaveValue('4');
  },
});
