import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { SuggestField } from './SuggestField';

const PREVIEWABLE_EXT = /\.(svg|png|jpg|jpeg)$/i;

function toPreviewSrc(path: string): string | null {
  const value = path.trim();
  if (!PREVIEWABLE_EXT.test(value)) {
    return null;
  }
  return value.startsWith('/') ? value : `/${value}`;
}

const meta = preview.meta({
  component: SuggestField,
  parameters: legacyStoryParameters,
});

export const Default = meta.story({
  args: {
    id: 'suggest-story-default',
    value: 'alpha',
    onChange: () => {},
    options: ['alpha', 'beta', 'gamma'],
  },
});

export const WithPreview = meta.story({
  args: {
    id: 'suggest-story-preview',
    value: '/vector/icon/eye.svg',
    onChange: () => {},
    options: [
      '/vector/icon/eye.svg',
      '/vector/icon/traitor.svg',
      '/vector/icon/alliance.svg',
      '/vector/logo/atreides.svg',
    ],
    optionAdapters: { toPreviewSrc },
  },
});
