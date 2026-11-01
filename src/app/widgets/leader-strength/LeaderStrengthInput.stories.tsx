import preview from '@sb/preview';

import { StrengthField } from './LeaderStrengthInput.stories.fixture';

const meta = preview.meta({
  title: 'Leader Strength Input',
  component: StrengthField,
  parameters: { layout: 'padded' },
  args: { initial: 5 },
});

/** A leader's strength as the field shows it. */
export const Strength = meta.story({});
