import preview from '@sb/preview';

import { AnimatedLeaderToken } from './AnimatedLeaderToken';

const meta = preview.meta({
  component: AnimatedLeaderToken,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '20rem' }}>
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});
