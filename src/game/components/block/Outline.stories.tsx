import preview from '@sb/preview';

import { Outline } from './Outline';
import { Text } from './Text';

const meta = preview.meta({
  component: Outline,
  args: {
    variant: 'normal',
    children: (
      <Text>
        <h1>Battle prescience</h1>
        <p>Reveal one element of the opposing Battle Plan before committing your own.</p>
      </Text>
    ),
  },
  argTypes: {
    children: { control: false },
  },
});

export const Standard = meta.story({
  args: { variant: 'normal' },
});
export const Example = meta.story({
  args: { variant: 'example' },
});
