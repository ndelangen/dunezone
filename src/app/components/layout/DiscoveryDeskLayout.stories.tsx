import { Box } from '@mantine/core';
import preview from '@sb/preview';

import { DiscoveryDeskLayout } from './DiscoveryDeskLayout';
import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';

const meta = preview.meta({
  component: DiscoveryDeskLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Pairs current catalogue activity with planned work. The unequal desktop columns become one reading column on narrower screens.',
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
    catalogue: <LayoutSlotPlaceholder name="catalogue" minHeight={360} />,
    future: <LayoutSlotPlaceholder name="future" minHeight={360} />,
  },
  argTypes: {
    catalogue: { control: false },
    future: { control: false },
  },
});

export const Desktop = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

export const Mobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});
