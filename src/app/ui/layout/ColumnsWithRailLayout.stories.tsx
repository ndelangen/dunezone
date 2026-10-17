import { Image, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';

import { ColumnsWithRailLayout } from './ColumnsWithRailLayout';
import {
  expectSideBySideSlots,
  expectStackedSlots,
  expectStressColumnKeepsItsTrack,
  LayoutSlotPlaceholder,
} from './LayoutSlotPlaceholder.stories.fixture';

const meta = preview.meta({
  component: ColumnsWithRailLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Places two reading columns beside a narrow rail, top-aligned, and gives the columns up in two stages as its own container narrows: first the reading columns merge into one while the rail keeps its column, then everything falls into a single column. Its parent owns page width and outer spacing.',
      },
    },
  },
});

const primary = <LayoutSlotPlaceholder name="primary" tone="primary" minHeight={420} />;
const secondary = <LayoutSlotPlaceholder name="secondary" tone="secondary" minHeight={320} />;
const rail = <LayoutSlotPlaceholder name="rail" tone="tertiary" minHeight={240} />;

/** Widest: three columns, the rail last and narrowest. */
export const ThreeColumns = meta.story({
  render: () => (
    <ColumnsWithRailLayout>
      <ColumnsWithRailLayout.Primary>{primary}</ColumnsWithRailLayout.Primary>
      <ColumnsWithRailLayout.Secondary>{secondary}</ColumnsWithRailLayout.Secondary>
      <ColumnsWithRailLayout.Rail>{rail}</ColumnsWithRailLayout.Rail>
    </ColumnsWithRailLayout>
  ),
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    await expectSideBySideSlots(canvasElement, ['primary', 'secondary', 'rail']);
  },
});

/** The middle stage: the reading columns stack into one, with the rail still alongside them. */
export const ReadingColumnsStacked = meta.story({
  render: () => (
    <ColumnsWithRailLayout>
      <ColumnsWithRailLayout.Primary>{primary}</ColumnsWithRailLayout.Primary>
      <ColumnsWithRailLayout.Secondary>{secondary}</ColumnsWithRailLayout.Secondary>
      <ColumnsWithRailLayout.Rail>{rail}</ColumnsWithRailLayout.Rail>
    </ColumnsWithRailLayout>
  ),
  globals: { viewport: { value: 'appConstrained' } },
  play: async ({ canvasElement }) => {
    await expectStackedSlots(canvasElement, ['primary', 'secondary']);
    await expectSideBySideSlots(canvasElement, ['primary', 'rail']);
  },
});

/** Narrowest: one reading column, primary first and the rail last. Driven by the container, not the viewport. */
export const Stacked = meta.story({
  render: () => (
    <ColumnsWithRailLayout>
      <ColumnsWithRailLayout.Primary>{primary}</ColumnsWithRailLayout.Primary>
      <ColumnsWithRailLayout.Secondary>{secondary}</ColumnsWithRailLayout.Secondary>
      <ColumnsWithRailLayout.Rail>{rail}</ColumnsWithRailLayout.Rail>
    </ColumnsWithRailLayout>
  ),
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    await expectStackedSlots(canvasElement, ['primary', 'secondary', 'rail']);
  },
});

/** An unbreakable word and an oversized image must both respect the column they are given. */
export const IntrinsicSizingStress = meta.story({
  render: () => (
    <ColumnsWithRailLayout>
      <ColumnsWithRailLayout.Primary>
        <Stack gap="md">
          <Text>DuneZoneLayoutStressCaseWithAnUnbrokenFactionNameThatMustRespectItsAllocatedContainer</Text>
          <Image alt="Intrinsic sizing test" mah={320} src="/web/tablet1.jpg" w={1400} />
        </Stack>
      </ColumnsWithRailLayout.Primary>
      <ColumnsWithRailLayout.Secondary>{secondary}</ColumnsWithRailLayout.Secondary>
      <ColumnsWithRailLayout.Rail>{rail}</ColumnsWithRailLayout.Rail>
    </ColumnsWithRailLayout>
  ),
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    await expectStressColumnKeepsItsTrack(canvasElement);
  },
});
