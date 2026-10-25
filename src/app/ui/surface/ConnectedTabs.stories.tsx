import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { ConnectedTabs } from './ConnectedTabs';
import { examplePanels } from './ConnectedTabs.stories.fixture';
import type { ExampleTab } from './ConnectedTabs.stories.fixture';

const meta = preview.meta({
  title: 'Connected Tabs',
  component: ConnectedTabs,
  args: {
    value: 'overview',
    onValueChange: () => {},
    ariaLabel: 'Workbench sections',
    items: examplePanels(),
  },
  argTypes: {
    value: { control: false, table: { disable: true } },
    onValueChange: { control: false, table: { disable: true } },
    items: { control: false, table: { disable: true } },
    ariaLabel: { control: false, table: { disable: true } },
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'ConnectedTabs is controlled: consumers own the selected value. These stories use a small decorator-only state harness to demonstrate interaction without changing the component contract.',
      },
    },
  },
  decorators: [
    function ControlledSelection(Story, context) {
      const [value, setValue] = useState<ExampleTab>(context.args.value ?? 'overview');
      return (
        <Story
          args={{
            ...context.args,
            value,
            onValueChange: setValue,
          }}
        />
      );
    },
  ],
});

export const FirstActive = meta.story({
  args: { value: 'overview' },
  play: async ({ canvasElement }) => {
    await waitFor(async () => {
      await expect(canvasElement.querySelector('[class*="glassSurface"]')).not.toBeNull();
      await expect(canvasElement.querySelector('svg[class*="geometryContour"] path')).not.toBeNull();
    });

    const surface = canvasElement.querySelector<HTMLElement>('[class*="glassSurface"]');
    await expect(getComputedStyle(surface as HTMLElement).backdropFilter).toBe('blur(8px)');
  },
});

export const ContentDrivenHeight = meta.story({
  args: {
    value: 'overview',
    items: examplePanels({ contentHeight: 720 }),
  },
  parameters: {
    docs: {
      description: {
        story: 'The surface grows beyond the tab rail when its selected panel contains taller content.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    /* The rail ends with its last tab; the list itself stretches with the surface. */
    const lastTab = within(canvasElement).getAllByRole('tab').at(-1)!.getBoundingClientRect();
    await waitFor(async () => {
      const surface = canvasElement.querySelector('[class*="glassSurface"]')!.getBoundingClientRect();
      const contour = canvasElement.querySelector('svg[class*="geometryContour"] path')!.getBoundingClientRect();
      await expect(surface.bottom).toBeGreaterThan(lastTab.bottom + 100);
      /* The contour is drawn round the whole surface, not just the rail. */
      await expect(contour.bottom).toBeCloseTo(surface.bottom, -1);
    });
  },
});

export const ResizeDrivenGeometry = meta.story({
  args: {
    value: 'people',
    items: examplePanels({ contentHeight: 320, animateDimensions: true }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Resize the Storybook canvas with the Viewport toolbar, browser window, or sidebar. Width always follows the canvas, while height is the greater of the left tab rail and selected-panel content. The SVG contour and clipped glass surface follow every intermediate size.',
      },
    },
  },
});

export const MobileViewport = meta.story({
  args: {
    value: 'overview',
    items: examplePanels({ showPanelTitle: false }),
  },
  globals: {
    viewport: {
      value: 'appMobile',
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Uses the App mobile viewport. Below the narrow container threshold, the left rail becomes the selected compact title stepper while the same controlled panel remains mounted.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const tabList = canvasElement.querySelector<HTMLElement>('[role="tablist"]');
    const root = tabList?.parentElement;
    const panel = canvasElement.querySelector<HTMLElement>('[role="tabpanel"]');
    const mobilePicker = canvasElement.querySelector<HTMLElement>('[data-connected-tabs-mobile-picker]');
    const canvas = within(canvasElement);

    await waitFor(async () => {
      const canvasRect = canvasElement.getBoundingClientRect();
      const rootRect = root?.getBoundingClientRect();

      await expect(root).not.toBeNull();
      await expect(panel).not.toBeNull();
      await expect(mobilePicker).not.toBeNull();
      await expect(rootRect?.width).toBeCloseTo(canvasRect.width);
      await expect(rootRect?.right).toBeLessThanOrEqual(canvasRect.right);
      await expect(getComputedStyle(tabList as HTMLElement).display).toBe('none');
      await expect(getComputedStyle(mobilePicker as HTMLElement).display).toBe('grid');
      await expect(getComputedStyle(root as HTMLElement).backdropFilter).toBe('blur(8px)');
    });

    const picker = canvas.getByRole('combobox', { name: 'Workbench sections' });
    await expect(picker).toHaveTextContent('Overview');
    await userEvent.click(canvas.getByRole('button', { name: 'Next section' }));
    await expect(picker).toHaveTextContent('People');
    await expect(canvas.getByTestId('panel-body-people')).toBeVisible();
  },
});

export const OverflowPreserved = meta.story({
  args: { value: 'people' },
  render: (args) => (
    <Box p="xl">
      <ConnectedTabs {...args} />
      <Box data-testid="overflow-marker" w={48} h={48} ml={540} mt={-80} bg="dune.7" />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('overflow-marker')).toBeVisible();
    const root = canvasElement.querySelector('[role="tablist"]')?.parentElement;
    await expect(getComputedStyle(root as Element).overflow).toBe('visible');
  },
});

export const StickyRail = meta.story({
  args: { value: 'people', stickyRail: true, items: examplePanels({ contentHeight: 1600 }) },
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>('[data-sticky-rail]')!;
    const rail = within(canvasElement).getByRole('tablist');
    const contour = root.querySelector('svg[class*="geometryContour"] path');
    await waitFor(async () => {
      await expect(contour).not.toBeNull();
    });
    const before = contour?.getAttribute('d');
    window.scrollTo(0, 350);
    try {
      await waitFor(async () => {
        await expect(root.getBoundingClientRect().top).toBeLessThan(0);
        await expect(rail.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
        await expect(contour?.getAttribute('d')).not.toBe(before);
      });
    } finally {
      window.scrollTo(0, 0);
    }
  },
});
