import { Box, Image, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';

import { AsymmetricSplitLayout } from './AsymmetricSplitLayout';
import {
  LayoutSlotPlaceholder,
  LayoutStoryCase,
  LayoutStoryFrame,
} from './LayoutSlotPlaceholder.stories.fixture';

const meta = preview.meta({
  component: AsymmetricSplitLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Places wide and narrow regions in unequal columns, then stacks them into one reading column when its own container is constrained. Its parent owns page width and outer spacing.',
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
  render: (args) => (
    <LayoutStoryFrame width={1120}>
      <AsymmetricSplitLayout {...args} />
    </LayoutStoryFrame>
  ),
});

export const ConstrainedContainer = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  render: (args) => (
    <LayoutStoryFrame width={760}>
      <AsymmetricSplitLayout {...args} />
    </LayoutStoryFrame>
  ),
});

export const BreakpointBoundary = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  render: (args) => (
    <Stack gap="xl">
      <LayoutStoryCase label="One pixel below" width={979}>
        <AsymmetricSplitLayout {...args} />
      </LayoutStoryCase>
      <LayoutStoryCase label="At the threshold" width={980}>
        <AsymmetricSplitLayout {...args} />
      </LayoutStoryCase>
      <LayoutStoryCase label="One pixel above" width={981}>
        <AsymmetricSplitLayout {...args} />
      </LayoutStoryCase>
    </Stack>
  ),
});

export const IntrinsicSizingStress = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  render: (args) => (
    <LayoutStoryFrame width={1120}>
      <AsymmetricSplitLayout
        {...args}
        wide={
          <Stack gap="md">
            <Text>
              DuneZoneLayoutStressCaseWithAnUnbrokenFactionNameThatMustRespectItsAllocatedContainer
            </Text>
            <Image alt="Intrinsic sizing test" mah={320} src="/web/tablet1.jpg" w={1400} />
          </Stack>
        }
      />
    </LayoutStoryFrame>
  ),
});
