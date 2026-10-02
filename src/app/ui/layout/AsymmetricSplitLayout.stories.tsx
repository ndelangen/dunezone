import { Image, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

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
});

const narrow = <LayoutSlotPlaceholder name="narrow" tone="secondary" minHeight={360} />;

/** Above the container breakpoint: unequal columns, wide leading. */
export const TwoColumns = meta.story({
  render: () => (
    <AsymmetricSplitLayout>
      <AsymmetricSplitLayout.Wide>
        <LayoutSlotPlaceholder name="wide" tone="primary" minHeight={360} />
      </AsymmetricSplitLayout.Wide>
      <AsymmetricSplitLayout.Narrow>{narrow}</AsymmetricSplitLayout.Narrow>
    </AsymmetricSplitLayout>
  ),
  globals: { viewport: { value: 'appDesktop' } },
});

/** Below it: one reading column, wide first. Driven by the container, not the viewport. */
export const Stacked = meta.story({
  render: () => (
    <AsymmetricSplitLayout>
      <AsymmetricSplitLayout.Wide>
        <LayoutSlotPlaceholder name="wide" tone="primary" minHeight={360} />
      </AsymmetricSplitLayout.Wide>
      <AsymmetricSplitLayout.Narrow>{narrow}</AsymmetricSplitLayout.Narrow>
    </AsymmetricSplitLayout>
  ),
  globals: { viewport: { value: 'appConstrained' } },
});

/** The narrow column on the leading side, for alternating a picture from one pane to the next. */
export const NarrowStart = meta.story({
  render: () => (
    <AsymmetricSplitLayout narrowSide="start">
      <AsymmetricSplitLayout.Wide>
        <LayoutSlotPlaceholder name="wide" tone="primary" minHeight={360} />
      </AsymmetricSplitLayout.Wide>
      <AsymmetricSplitLayout.Narrow>{narrow}</AsymmetricSplitLayout.Narrow>
    </AsymmetricSplitLayout>
  ),
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    const wide = within(canvasElement).getByText('wide').getBoundingClientRect();
    const narrowSlot = within(canvasElement).getByText('narrow').getBoundingClientRect();
    await expect(narrowSlot.left).toBeLessThan(wide.left);
  },
});

/** Stacked with the narrow column first, so a picture introduces the text it sits beside. */
export const StackedNarrowFirst = meta.story({
  render: () => (
    <AsymmetricSplitLayout stackFirst="narrow">
      <AsymmetricSplitLayout.Wide>
        <LayoutSlotPlaceholder name="wide" tone="primary" minHeight={360} />
      </AsymmetricSplitLayout.Wide>
      <AsymmetricSplitLayout.Narrow>{narrow}</AsymmetricSplitLayout.Narrow>
    </AsymmetricSplitLayout>
  ),
  globals: { viewport: { value: 'appConstrained' } },
  play: async ({ canvasElement }) => {
    const wide = within(canvasElement).getByText('wide').getBoundingClientRect();
    const narrowSlot = within(canvasElement).getByText('narrow').getBoundingClientRect();
    await expect(narrowSlot.top).toBeLessThan(wide.top);
    const [first] = within(canvasElement).getAllByText(/^(wide|narrow)$/);
    await expect(first).toHaveTextContent('narrow');
  },
});

/** The slim rail on the leading side keeps its fixed-ish band. */
export const SlimNarrowStart = meta.story({
  render: () => (
    <AsymmetricSplitLayout rail="slim" narrowSide="start">
      <AsymmetricSplitLayout.Wide>
        <LayoutSlotPlaceholder name="wide" tone="primary" minHeight={360} />
      </AsymmetricSplitLayout.Wide>
      <AsymmetricSplitLayout.Narrow>{narrow}</AsymmetricSplitLayout.Narrow>
    </AsymmetricSplitLayout>
  ),
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    const wide = within(canvasElement).getByText('wide').getBoundingClientRect();
    const narrowSlot = within(canvasElement).getByText('narrow').getBoundingClientRect();
    await expect(narrowSlot.left).toBeLessThan(wide.left);
  },
});

/** An unbreakable word and an oversized image must both respect the column they are given. */
export const IntrinsicSizingStress = meta.story({
  render: () => (
    <AsymmetricSplitLayout>
      <AsymmetricSplitLayout.Wide>
        <Stack gap="md">
          <Text>DuneZoneLayoutStressCaseWithAnUnbrokenFactionNameThatMustRespectItsAllocatedContainer</Text>
          <Image alt="Intrinsic sizing test" mah={320} src="/web/tablet1.jpg" w={1400} />
        </Stack>
      </AsymmetricSplitLayout.Wide>
      <AsymmetricSplitLayout.Narrow>{narrow}</AsymmetricSplitLayout.Narrow>
    </AsymmetricSplitLayout>
  ),
  globals: { viewport: { value: 'appDesktop' } },
});

/** The slim variant: the wide column is the page's matter, and the rail is a band for a preview and a few cards. */
export const SlimRail = meta.story({
  render: () => (
    <AsymmetricSplitLayout rail="slim">
      <AsymmetricSplitLayout.Wide>
        <LayoutSlotPlaceholder name="wide" tone="primary" minHeight={280} />
      </AsymmetricSplitLayout.Wide>
      <AsymmetricSplitLayout.Narrow>
        <LayoutSlotPlaceholder name="narrow" tone="secondary" minHeight={280} />
      </AsymmetricSplitLayout.Narrow>
    </AsymmetricSplitLayout>
  ),
});

/** `narrowFallback="hide"` keeps the columns side by side where the default would stack them. */
export const HideFallbackKeepsColumns = meta.story({
  render: () => (
    <AsymmetricSplitLayout narrowFallback="hide">
      <AsymmetricSplitLayout.Wide>
        <LayoutSlotPlaceholder name="wide" tone="primary" minHeight={360} />
      </AsymmetricSplitLayout.Wide>
      <AsymmetricSplitLayout.Narrow>{narrow}</AsymmetricSplitLayout.Narrow>
    </AsymmetricSplitLayout>
  ),
  globals: { viewport: { value: 'appConstrained' } },
  play: async ({ canvasElement }) => {
    const wide = within(canvasElement).getByText('wide').getBoundingClientRect();
    const narrowSlot = within(canvasElement).getByText('narrow').getBoundingClientRect();
    await expect(narrowSlot.left).toBeGreaterThan(wide.left);
    await expect(narrowSlot.top).toBe(wide.top);
  },
});

/** On a phone the same layout drops the narrow column and the wide one takes the width. */
export const HideFallbackOnPhone = meta.story({
  render: () => (
    <AsymmetricSplitLayout narrowFallback="hide">
      <AsymmetricSplitLayout.Wide>
        <LayoutSlotPlaceholder name="wide" tone="primary" minHeight={360} />
      </AsymmetricSplitLayout.Wide>
      <AsymmetricSplitLayout.Narrow>{narrow}</AsymmetricSplitLayout.Narrow>
    </AsymmetricSplitLayout>
  ),
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('narrow')).not.toBeVisible();
  },
});
