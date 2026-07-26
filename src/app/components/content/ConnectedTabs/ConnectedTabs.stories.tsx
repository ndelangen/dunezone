import { Box, Title } from '@mantine/core';
import preview from '@sb/preview';
import { BookOpen, CircleUserRound, Settings } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { ConnectedTabs } from './ConnectedTabs';
import storyStyles from './ConnectedTabs.stories.module.css';

type ExampleTab = 'overview' | 'people' | 'settings';

interface ConnectedTabsFixtureProps {
  initialValue?: ExampleTab;
  contentHeight?: number;
  animateDimensions?: boolean;
}

function Panel({
  title,
  children,
  contentHeight,
  animateDimensions,
}: {
  title: string;
  children: React.ReactNode;
  contentHeight: number;
  animateDimensions: boolean;
}) {
  return (
    <Box>
      <Title order={2}>{title}</Title>
      <Box mt="sm">{children}</Box>
      <Box
        data-testid="content-height"
        className={animateDimensions ? storyStyles.animatedContent : undefined}
        mt="xl"
        h={contentHeight}
      />
    </Box>
  );
}

function ConnectedTabsFixture({
  initialValue = 'overview',
  contentHeight = 180,
  animateDimensions = false,
}: ConnectedTabsFixtureProps) {
  const [value, setValue] = useState<ExampleTab>(initialValue);
  const items = [
    {
      value: 'overview',
      label: 'Overview',
      icon: <BookOpen size={20} />,
      panel: (
        <Panel title="Overview" contentHeight={contentHeight} animateDimensions={animateDimensions}>
          A short representative content panel.
        </Panel>
      ),
    },
    {
      value: 'people',
      label: 'People',
      icon: <CircleUserRound size={20} />,
      panel: (
        <Panel title="People" contentHeight={contentHeight} animateDimensions={animateDimensions}>
          The joined contour follows this panel as its dimensions change.
        </Panel>
      ),
    },
    {
      value: 'settings',
      label: 'Settings',
      icon: <Settings size={20} />,
      panel: (
        <Panel title="Settings" contentHeight={contentHeight} animateDimensions={animateDimensions}>
          The final tab joins the panel at its lower edge.
        </Panel>
      ),
    },
  ] as const;

  return (
    <Box p="xl" w="100%">
      <ConnectedTabs
        value={value}
        onValueChange={setValue}
        items={items}
        ariaLabel="Workbench sections"
      />
    </Box>
  );
}

const meta = preview.meta({
  title: 'App/Content/ConnectedTabs',
  component: ConnectedTabsFixture,
  args: {
    contentHeight: 180,
  },
  argTypes: {
    initialValue: { control: false, table: { disable: true } },
    contentHeight: {
      name: 'Content height',
      description: 'Selected-panel content height in pixels.',
      control: { type: 'range', min: 40, max: 800, step: 20 },
    },
    animateDimensions: { control: false, table: { disable: true } },
  },
  parameters: {
    layout: 'fullscreen',
  },
});

export const FirstActive = meta.story({
  args: { initialValue: 'overview' },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(canvasElement.querySelector('[class*="glassSurface"]')).not.toBeNull();
      expect(canvasElement.querySelector('svg[class*="geometryContour"] path')).not.toBeNull();
    });

    const surface = canvasElement.querySelector<HTMLElement>('[class*="glassSurface"]');
    await expect(getComputedStyle(surface as HTMLElement).backdropFilter).toBe('blur(8px)');
  },
});

export const MiddleActive = meta.story({
  args: { initialValue: 'people' },
});

export const FinalActive = meta.story({
  args: { initialValue: 'settings' },
});

export const ContentDrivenHeight = meta.story({
  args: {
    initialValue: 'overview',
    contentHeight: 720,
  },
  parameters: {
    docs: {
      description: {
        story:
          'The surface grows beyond the tab rail when its selected panel contains taller content.',
      },
    },
  },
});

export const ResizeDrivenGeometry = meta.story({
  args: {
    initialValue: 'people',
    contentHeight: 320,
  },
  render: (args) => <ConnectedTabsFixture {...args} animateDimensions />,
  parameters: {
    docs: {
      description: {
        story:
          'Resize the Storybook canvas with the Viewport toolbar, browser window, or sidebar; use the Content height control for the other axis. Width always follows the canvas, while height is the greater of the left tab rail and selected-panel content. The SVG contour and clipped glass surface follow every intermediate size.',
      },
    },
  },
});

export const MobileViewport = meta.story({
  args: {
    initialValue: 'overview',
    contentHeight: 180,
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
          'Uses Storybook’s App mobile viewport. The rail remains on the left, the component width follows the available viewport, and its compact container-query values apply.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const tabList = canvasElement.querySelector<HTMLElement>('[role="tablist"]');
    const root = tabList?.parentElement;
    const panel = canvasElement.querySelector<HTMLElement>('[role="tabpanel"]');
    const contour = canvasElement.querySelector<SVGElement>('svg[class*="geometryContour"]');

    await waitFor(() => {
      const canvasRect = canvasElement.getBoundingClientRect();
      const rootRect = root?.getBoundingClientRect();

      expect(root).not.toBeNull();
      expect(panel).not.toBeNull();
      expect(contour).not.toBeNull();
      expect(rootRect?.width).toBeLessThanOrEqual(390);
      expect(rootRect?.right).toBeLessThanOrEqual(canvasRect.right);
      expect(tabList?.getBoundingClientRect().right).toBeLessThanOrEqual(
        panel?.getBoundingClientRect().left ?? 0
      );
      expect(
        getComputedStyle(root as HTMLElement).getPropertyValue('--connected-tabs-rail-width')
      ).toBe('9.25rem');
    });
  },
});

export const KeyboardAndPointerActivation = meta.story({
  args: { initialValue: 'overview' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const overview = canvas.getByRole('tab', { name: 'Overview' });
    overview.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('tab', { name: 'People' })).toHaveAttribute(
      'data-state',
      'active'
    );
    await userEvent.click(canvas.getByRole('tab', { name: 'Settings' }));
    await expect(
      canvas.getByText('The final tab joins the panel at its lower edge.')
    ).toBeVisible();
  },
});

export const OverflowPreserved = meta.story({
  args: { initialValue: 'people' },
  render: (args) => (
    <Box p="xl">
      <ConnectedTabsFixture {...args} />
      <Box data-testid="overflow-marker" w={48} h={48} ml={540} mt={-80} bg="dune.7" />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('overflow-marker')).toBeVisible();
    const root = canvasElement.querySelector('[role="tablist"]')?.parentElement;
    await expect(getComputedStyle(root as Element).overflow).toBe('visible');
  },
});
