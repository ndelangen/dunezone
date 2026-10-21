import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import type { AssetBrowseEntry } from '@db/assets';

import { AssetCatalogueTile } from './AssetCatalogueTile';

const meta = preview.meta({
  component: AssetCatalogueTile,
  decorators: [
    (Story) => (
      <div style={{ width: '9.5rem' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    entry: {
      id: 'lasgun',
      type: 'card-treachery',
      slug: 'lasgun',
      name: 'Lasgun',
      data: {},
      previewHref: null,
      members: [],
    } as unknown as AssetBrowseEntry,
  },
});

export const MissingPublication = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'Lasgun' })).toHaveAttribute(
      'href',
      '/assets/card-treachery/lasgun'
    );
  },
});
