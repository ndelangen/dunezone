import { Box, Stack } from '@mantine/core';
import preview from '@sb/preview';

import { AsymmetricSplitLayout } from './AsymmetricSplitLayout';
import { AtlasLayout } from './AtlasLayout';
import storyStyles from './AtlasLayout.stories.module.css';
import {
  LayoutSlotPlaceholder,
  LayoutStoryCase,
  LayoutStoryFrame,
} from './LayoutSlotPlaceholder.stories.fixture';

const meta = preview.meta({
  component: AtlasLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Keeps a sidebar visible beside long-form content in a wide container and moves it into document flow when its own container is constrained. Its parent owns page width and outer spacing.',
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
  render: (args) => (
    <LayoutStoryFrame width={1120}>
      <AtlasLayout {...args} sidebarClassName={storyStyles.sidebarOffset}>
        <LayoutSlotPlaceholder name="scrolling children" minHeight={1400} />
      </AtlasLayout>
    </LayoutStoryFrame>
  ),
});

export const ConstrainedContainer = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  render: (args) => (
    <LayoutStoryFrame width={720}>
      <AtlasLayout {...args} />
    </LayoutStoryFrame>
  ),
});

export const NestedComposition = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  render: (args) => (
    <LayoutStoryFrame width={1120}>
      <AtlasLayout {...args} sidebar={<LayoutSlotPlaceholder name="sidebar" minHeight={480} />}>
        <AsymmetricSplitLayout
          wide={<LayoutSlotPlaceholder name="nested wide" minHeight={320} />}
          narrow={<LayoutSlotPlaceholder name="nested narrow" minHeight={320} />}
        />
      </AtlasLayout>
    </LayoutStoryFrame>
  ),
});

export const BreakpointBoundary = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  render: (args) => (
    <Stack gap="xl">
      <LayoutStoryCase label="One pixel below" width={899}>
        <AtlasLayout {...args} />
      </LayoutStoryCase>
      <LayoutStoryCase label="At the threshold" width={900}>
        <AtlasLayout {...args} />
      </LayoutStoryCase>
      <LayoutStoryCase label="One pixel above" width={901}>
        <AtlasLayout {...args} />
      </LayoutStoryCase>
    </Stack>
  ),
});
