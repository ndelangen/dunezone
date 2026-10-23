import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { InteractiveEditor } from './StormCardEditor.stories.fixture';

const meta = testingPreview.meta({
  title: 'Storm Card Editor',
  component: InteractiveEditor,
  parameters: { layout: 'padded' },
});
export const MovementAndLayers = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Storm movement' }));
    await userEvent.click(await page.findByRole('option', { name: /^6 sectors$/ }));
    await expect(canvas.getByText('Move the storm 6 sectors counter-clockwise.')).toBeVisible();
    await expect(canvas.getByText('6 Sectors', { exact: true })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Name' })).toHaveValue('1 Sector');
    await expect(canvas.queryByRole('tab', { name: 'Format' })).toBeNull();
    await expect(canvas.queryByRole('tab', { name: 'Symbol' })).toBeNull();
    await expect(canvas.queryByText('Head background')).toBeNull();
    await expect(canvas.queryByText('Symbol background')).toBeNull();
    await userEvent.click(canvas.getByRole('tab', { name: '2. Text' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Duplicate layer' }));
    await expect(canvas.getByRole('tab', { name: '3. Text' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(canvas.getByRole('tab', { name: /^Storm$/ }));
    await expect(canvas.getByText('Move the storm 6 sectors counter-clockwise.')).toBeVisible();
  },
});
