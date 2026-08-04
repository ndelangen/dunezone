import { Box } from '@mantine/core';
import preview from '@sb/preview';

import { AtlasLayout } from './AtlasLayout';
import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';

const meta = preview.meta({
  component: AtlasLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Keeps the Future plans territory index visible beside the ambition content on wide screens and moves it into document flow on compact screens.',
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
    index: <LayoutSlotPlaceholder name="index" minHeight={240} />,
    children: <LayoutSlotPlaceholder name="children" minHeight={720} />,
  },
  argTypes: {
    index: { control: false },
    children: { control: false },
  },
});

export const DesktopStickyIndex = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

export const MobileStack = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});
