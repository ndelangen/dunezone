import preview from '@sb/preview';

import { OptionPicker } from './OptionPicker';

const meta = preview.meta({
  component: OptionPicker,
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
