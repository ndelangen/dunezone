import { Box } from '@mantine/core';
import preview from '@sb/preview';

import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';
import { TriptychLayout } from './TriptychLayout';

const meta = preview.meta({
  component: TriptychLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Arranges left, center, and right regions as a three-part composition, then stacks them at constrained widths.',
      },
    },
  },
  decorators: [
    (Story) => (
      <Box p={{ base: 'md', md: 'xl' }} bg="var(--mantine-color-gray-0)" mih="100vh">
        <Story />
      </Box>
    ),
  ],
  args: {
    left: <LayoutSlotPlaceholder name="left" minHeight={320} />,
    center: <LayoutSlotPlaceholder name="center" minHeight={320} />,
    right: <LayoutSlotPlaceholder name="right" minHeight={320} />,
  },
  argTypes: {
    left: { control: false },
    center: { control: false },
    centerClassName: { control: false },
    right: { control: false },
  },
});

export const Desktop = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

export const Mobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});
