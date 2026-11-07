import preview from '@sb/preview';

import { FormattedTextSource, InlineFormattedTextSource } from './FormattedText';

const mixedSource =
  'Plans survive *first contact* until the Guild calls.\nAdjust without losing the _-*intent*-_.\n\nA blank line starts a new thought.\n\n- Gather the spice\n- Guard the shipment\n- Pay the Guild';

const meta = preview.meta({
  component: FormattedTextSource,
  globals: {
    backgrounds: { value: 'dark', grid: false },
  },
  parameters: { layout: 'padded' },
});

export const MixedBlocks = meta.story({
  args: {
    source: mixedSource,
  },
});

export const Dark = meta.story({
  globals: {
    backgrounds: { value: 'dark', grid: false },
  },
  args: {
    source: mixedSource,
  },
});

export const NestedMarks = meta.story({
  args: {
    source: 'Every _-*layer*-_ stays legible, including *bold*, -italic-, and _underlined_ words.',
  },
});

export const InlineSource = meta.story({
  args: { source: '' },
  render: () => (
    <h2>
      Can I use <InlineFormattedTextSource source="*this* effect" />?
    </h2>
  ),
});
