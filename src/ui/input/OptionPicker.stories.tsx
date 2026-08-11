import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { OptionPicker } from './OptionPicker';

const meta = preview.meta({
  component: OptionPicker,
  parameters: legacyStoryParameters,
});

export const Default = meta.story({
  args: {
    value: 'a',
    onValueChange: () => {},
    options: [
      { value: 'a', label: 'Option A' },
      { value: 'b', label: 'Option B' },
    ],
  },
});
