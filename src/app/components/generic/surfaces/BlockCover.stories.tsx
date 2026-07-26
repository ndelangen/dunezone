import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { BlockCover } from './BlockCover';

const meta = preview.meta({
  component: BlockCover,
  parameters: legacyStoryParameters,
});

export const WithImage = meta.story({
  args: {
    src: '/web/logo.svg',
    alt: 'Example cover',
  },
});

export const WithPlaceholder = meta.story({
  args: {
    src: null,
    placeholder: 'No cover image',
  },
});
