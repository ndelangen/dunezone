import { Box } from '@mantine/core';
import preview from '@sb/preview';

import { HomepageStoryLayout } from './HomepageStoryLayout';
import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';

const meta = preview.meta({
  component: HomepageStoryLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Balances the homepage play invitation, animated asset preview, and homebrew invitation. The regions stack at constrained widths.',
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
    play: <LayoutSlotPlaceholder name="play" minHeight={320} />,
    preview: <LayoutSlotPlaceholder name="preview" minHeight={320} />,
    create: <LayoutSlotPlaceholder name="create" minHeight={320} />,
  },
  argTypes: {
    play: { control: false },
    preview: { control: false },
    create: { control: false },
  },
});

export const Desktop = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

export const Mobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});
