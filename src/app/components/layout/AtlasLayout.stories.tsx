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
          'Keeps a sidebar visible beside long-form content on wide screens and moves it into document flow on compact screens. Its parent owns page width and outer spacing.',
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
    sidebar: <LayoutSlotPlaceholder name="sidebar" minHeight={240} />,
    children: <LayoutSlotPlaceholder name="children" minHeight={720} />,
  },
  argTypes: {
    className: { control: false },
    sidebar: { control: false },
    sidebarClassName: { control: false },
    children: { control: false },
  },
});

export const DesktopStickySidebar = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

export const MobileStack = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});
