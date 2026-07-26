import preview from '@sb/preview';
import { Fragment } from 'react';

import { Definitions } from './Definitions';
import { Text } from './Text';

const meta = preview.meta({
  component: Definitions,
  args: {
    children: (
      <Fragment>
        <dt>Spice</dt>
        <dd>The resource that drives commerce and conflict on Arrakis.</dd>

        <dt>Stronghold</dt>
        <dd>A named territory that can contribute to a faction victory.</dd>

        <dt>Treachery Card</dt>
        <dd>
          <p>A card held secretly until its timing permits it to be played.</p>
          <p>Weapons and defenses are revealed as part of a Battle Plan.</p>
        </dd>
      </Fragment>
    ),
  },
  argTypes: {
    children: { control: false },
  },
  decorators: [
    (StoryFn) => (
      <Text>
        <StoryFn />
      </Text>
    ),
  ],
});

export const Default = meta.story({
  args: {},
});
