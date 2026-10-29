import preview from '@sb/preview';
import { TokenImage } from '@ui/content/TokenImage';
import { expect, within } from 'storybook/test';

import { ChipList } from './ChipList';

const disc = (fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="100%" height="100%" fill="${fill}"/></svg>`)}`;

const NAMES = ['House Atreides', 'House Harkonnen', 'Fremen', 'Bene Gesserit', 'Spacing Guild', 'Emperor'];

const meta = preview.meta({
  component: ChipList,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ maxWidth: '28rem' }}>{Story()}</div>],
  args: {
    items: NAMES.map((name, index) => ({
      key: name,
      figure: <TokenImage src={disc(index % 2 ? '#4b4c0d' : '#e3dbb3')} name={name} shape="round" />,
      label: name,
    })),
  },
});

/** The factions wrap onto as many lines as the width needs, each disc beside its name. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('listitem')).toHaveLength(NAMES.length);
  },
});
