import preview from '@sb/preview';

import { Token } from '../token/Token';
import { emblems, EmblemGallery, SmallEmblems, tokenBackground } from './MoreEmblems.stories.fixture';

const meta = preview.meta({
  title: 'More emblems',
  component: Token,
  args: { background: tokenBackground },
  globals: { viewport: { value: 'disc' } },
});
const gallery = {
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
} as const;

export const AllFifty = meta.story({
  ...gallery,
  render: () => <EmblemGallery title="Fifty more faction emblems" items={Object.values(emblems)} />,
});
export const AtSmallSizes = meta.story({ ...gallery, render: () => <SmallEmblems /> });
