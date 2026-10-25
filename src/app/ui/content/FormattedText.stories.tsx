import preview from '@sb/preview';
import { parseFormattedText } from '@shared/formattedText';
import { expect, within } from 'storybook/test';

import { FormattedText, FormattedTextSource, InlineFormattedTextSource } from './FormattedText';
import type { FormattedTextBlocks } from './FormattedText';

function validBlocks(source: string): FormattedTextBlocks {
  const parsed = parseFormattedText(source);
  if (!parsed.valid) {
    throw new Error('A FormattedText story contains invalid source.');
  }
  return parsed.blocks;
}

const mixedBlocks = validBlocks(
  'Plans survive *first contact* until the Guild calls.\nAdjust without losing the _-*intent*-_.\n\nA blank line starts a new thought.\n\n- Gather the spice\n- Guard the shipment\n- Pay the Guild'
);

const meta = preview.meta({
  component: FormattedText,
  globals: {
    backgrounds: { value: 'dark', grid: false },
  },
  parameters: { layout: 'padded' },
});

export const MixedBlocks = meta.story({
  args: {
    blocks: mixedBlocks,
  },
});

export const Dark = meta.story({
  globals: {
    backgrounds: { value: 'dark', grid: false },
  },
  args: {
    blocks: mixedBlocks,
  },
});

export const NestedMarks = meta.story({
  args: {
    blocks: validBlocks('Every _-*layer*-_ stays legible, including *bold*, -italic-, and _underlined_ words.'),
  },
});

export const StoredSource = meta.story({
  args: { blocks: [] },
  render: () => <FormattedTextSource source={'A *formatted* paragraph.\n\n- First point\n- Second point'} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('formatted').tagName).toBe('STRONG');
    const items = within(canvas.getByRole('list')).getAllByRole('listitem');
    await expect(items.map((item) => item.textContent)).toEqual(['First point', 'Second point']);
  },
});

export const InlineSource = meta.story({
  args: { blocks: [] },
  render: () => (
    <h2>
      Can I use <InlineFormattedTextSource source="*this* effect" />?
    </h2>
  ),
});
