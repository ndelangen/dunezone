import { Image, Stack, Text } from '@mantine/core';
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
          'Places wide and narrow regions in unequal columns, then stacks them into one reading column once its own container drops below 61.25rem. Its parent owns page width and outer spacing.',
      },
    },
  },
  args: {
    wide: <LayoutSlotPlaceholder name="wide" minHeight={360} />,
    narrow: <LayoutSlotPlaceholder name="narrow" minHeight={360} />,
  },
  argTypes: { className: { control: false } },
});

/** Above the container breakpoint: unequal columns, wide leading. */
export const TwoColumns = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

/** Below it: one reading column, wide first. Driven by the container, not the viewport. */
export const Stacked = meta.story({
  globals: { viewport: { value: 'appConstrained' } },
});

/** An unbreakable word and an oversized image must both respect the column they are given. */
export const IntrinsicSizingStress = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  args: {
    wide: (
      <Stack gap="md">
        <Text>
          DuneZoneLayoutStressCaseWithAnUnbrokenFactionNameThatMustRespectItsAllocatedContainer
        </Text>
        <Image alt="Intrinsic sizing test" mah={320} src="/web/tablet1.jpg" w={1400} />
      </Stack>
    ),
  },
});
