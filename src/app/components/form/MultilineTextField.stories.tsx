import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { MultilineTextField } from './MultilineTextField';

const meta = preview.meta({
  component: MultilineTextField,
  parameters: legacyStoryParameters,
});

export const Default = meta.story({
  args: {
    placeholder: 'Description',
    rows: 4,
  },
});
