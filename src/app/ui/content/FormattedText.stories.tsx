import preview from '@sb/preview';
import { parseFormattedText } from '@shared/formattedText';

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
  'Plans survive *first contact* until the Guild calls.\nAdjust without losing the _-*intent*-_.\n\n- Gather the spice\n- Guard the shipment\n- Pay the Guild'
);

const meta = preview.meta({
  component: FormattedText,
  globals: {
    backgrounds: { value: 'light', grid: false },
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
    colorScheme: 'dark',
  },
  args: {
    blocks: mixedBlocks,
  },
});

export const ParagraphsAndLineBreaks = meta.story({
  args: {
    blocks: validBlocks(
      'Plans survive first contact.\nAdjust without losing the intent.\n\nA blank line starts a new thought.'
    ),
  },
});

export const List = meta.story({
  args: {
    blocks: validBlocks('- Gather the spice\n- Guard the shipment\n- Pay the Guild'),
  },
});

export const NestedMarks = meta.story({
  args: {
    blocks: validBlocks('Every _-*layer*-_ stays legible, including *bold*, -italic-, and _underlined_ words.'),
  },
});

export const Empty = meta.story({
  args: {
    blocks: [],
  },
});

export const StoredSource = meta.story({
  args: { blocks: [] },
  render: () => <FormattedTextSource source={'A *formatted* paragraph.\n\n- First point\n- Second point'} />,
});

export const InlineSource = meta.story({
  args: { blocks: [] },
  render: () => (
    <h2>
      Can I use <InlineFormattedTextSource source="*this* effect" />?
    </h2>
  ),
});
