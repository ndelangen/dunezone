import { testingPreview } from '@sb/preview';
import { expect, userEvent, within, screen } from 'storybook/test';

import { initialTokenDraft } from './TokenEditor';
import { DISC, discDraftWith, InteractiveEditor } from './TokenEditor.stories.fixture';

const meta = testingPreview.meta({
  title: 'Token Editor',
  component: InteractiveEditor,
  parameters: { layout: 'padded' },
  args: {
    type: DISC,
    draft: discDraftWith(initialTokenDraft(DISC).back),
  },
});

export const SymbolStyling = meta.story({
  args: { chapter: 'front' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fill = canvas.getByLabelText('Symbol fill');
    await userEvent.type(fill, '#07120f');
    const stroke = canvas.getByLabelText('Symbol outline');
    await userEvent.type(stroke, '#f3edbf');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Symbol outline width' }), '5.5');
    const shadow = canvas.getByRole('switch', { name: 'Symbol shadow' });
    await expect(shadow).toBeChecked();
    await userEvent.click(shadow);
    await expect(
      canvasElement.querySelector('use[fill="#07120f"][stroke="#f3edbf"][stroke-width="5.5"]')
    ).not.toBeNull();
    const symbol = canvasElement.querySelector('use[fill="#07120f"]')!.closest('[data-component-part="symbol"]');
    await expect(symbol).not.toHaveAttribute('filter');
  },
});

/** Raster illustrations stay in card editors while token symbols use SVG fragments. */
export const FrontSymbols = meta.story({
  args: { chapter: 'front' },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Symbol' }));
    await expect(screen.getByRole('group', { name: 'Decals / Custom stronghold illustrations' })).toBeVisible();
    await expect(screen.queryByRole('group', { name: 'Decals / GF9 Stronghold cards' })).toBeNull();
  },
});
