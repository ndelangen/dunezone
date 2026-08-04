import { Box } from '@mantine/core';
import preview from '@sb/preview';

import { AsymmetricSplitLayout } from './AsymmetricSplitLayout';
import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';

const meta = preview.meta({
  component: AsymmetricSplitLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Places wide and narrow regions in unequal desktop columns, then stacks them into one reading column on narrower screens. Its parent owns page width and outer spacing.',
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
    wide: <LayoutSlotPlaceholder name="wide" minHeight={360} />,
    narrow: <LayoutSlotPlaceholder name="narrow" minHeight={360} />,
  },
  argTypes: {
    className: { control: false },
    wide: { control: false },
    narrow: { control: false },
  },
});

export const Desktop = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

export const Mobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
});
