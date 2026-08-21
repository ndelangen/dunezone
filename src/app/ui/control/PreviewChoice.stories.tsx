import { Select } from '@mantine/core';
import preview from '@sb/preview';
import { fn } from 'storybook/test';

import { PreviewChoice } from './PreviewChoice';

/** Stands in for a real render so the stories stay in the kit and pull in no widget. */
function Swatch({ from, to }: { from: string; to: string }) {
  return <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${from}, ${to})` }} />;
}

const meta = preview.meta({
  title: 'Preview Choice',
  component: PreviewChoice,
  args: {
    label: 'Backside',
    value: 'authored',
    aspectRatio: '1',
    onChange: fn(),
    options: [
      { value: 'authored', label: 'Authored here', preview: <Swatch from="#8F2C1C" to="#621D1A" /> },
      { value: 'same', label: 'Same as front', preview: <Swatch from="#474620" to="#27260C" /> },
      { value: 'reference', label: "Another token's back", preview: <Swatch from="#29335E" to="#0A153C" /> },
    ],
  },
});

export const Default = meta.story({});

/** An option with nothing to draw yet paints the dashed reserved spot instead of an empty box. */
export const OptionWithNothingToShow = meta.story({
  args: {
    value: 'same',
    options: [
      { value: 'authored', label: 'Authored here' },
      { value: 'same', label: 'Same as front', preview: <Swatch from="#474620" to="#27260C" /> },
      { value: 'reference', label: "Another token's back" },
    ],
  },
});

/** A chosen option may carry a control of its own, which sits below the art rather than inside the button. */
export const ChosenOptionCarriesAControl = meta.story({
  args: {
    label: 'Cardback',
    value: 'stock',
    aspectRatio: '5 / 7',
    options: [
      {
        value: 'stock',
        label: 'Stock',
        preview: <Swatch from="#8F2C1C" to="#621D1A" />,
        detail: <Select size="xs" data={['Treachery', 'Spice', 'Traitor']} defaultValue="Treachery" />,
      },
      { value: 'custom', label: 'Custom', preview: <Swatch from="#474620" to="#27260C" /> },
      { value: 'reference', label: "Another deck's back", preview: <Swatch from="#29335E" to="#0A153C" /> },
    ],
  },
});

/** Card-shaped tiles, to show the caller owning the aspect ratio. */
export const CardShaped = meta.story({
  args: {
    label: 'Cardback',
    aspectRatio: '5 / 7',
    value: 'reference',
  },
});
