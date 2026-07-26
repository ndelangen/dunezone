import { Box, Title } from '@mantine/core';
import preview from '@sb/preview';
import { BookOpen, CircleUserRound, Settings } from 'lucide-react';
import { type ComponentType, type CSSProperties, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { ConnectedTabs, type ConnectedTabsProps } from './ConnectedTabs';
import storyStyles from './ConnectedTabs.stories.module.css';

type ExampleTab = 'overview' | 'people' | 'settings';

interface ConnectedTabsStoryArgs {
  value?: ExampleTab;
  onValueChange?: (value: ExampleTab) => void;
  items?: ConnectedTabsProps<ExampleTab>['items'];
  ariaLabel?: string;
  className?: string;
  panelClassName?: string;
  style?: CSSProperties;
  contentHeight?: number;
  animateDimensions?: boolean;
  showPanelTitle?: boolean;
}

function Panel({
  title,
  children,
  contentHeight,
  animateDimensions,
  showPanelTitle,
}: {
  title: string;
  children: React.ReactNode;
  contentHeight: number;
  animateDimensions: boolean;
  showPanelTitle: boolean;
}) {
  return (
    <Box>
      {showPanelTitle ? <Title order={2}>{title}</Title> : null}
      <Box mt={showPanelTitle ? 'sm' : 0}>{children}</Box>
      <Box
        data-testid="content-height"
        className={animateDimensions ? storyStyles.animatedContent : undefined}
        mt="xl"
        h={contentHeight}
      />
    </Box>
  );
}

function createItems({
  contentHeight,
  animateDimensions,
  showPanelTitle,
}: Pick<
  ConnectedTabsStoryArgs,
  'contentHeight' | 'animateDimensions' | 'showPanelTitle'
>): ConnectedTabsProps<ExampleTab>['items'] {
  const resolvedContentHeight = contentHeight ?? 180;
  const resolvedAnimateDimensions = animateDimensions ?? false;
  const resolvedShowPanelTitle = showPanelTitle ?? true;
  return [
    {
      value: 'overview',
      label: 'Overview',
      icon: <BookOpen size={20} />,
      panel: (
        <Panel
          title="Overview"
          contentHeight={resolvedContentHeight}
          animateDimensions={resolvedAnimateDimensions}
          showPanelTitle={resolvedShowPanelTitle}
        >
          A short representative content panel.
        </Panel>
      ),
    },
    {
      value: 'people',
      label: 'People',
      icon: <CircleUserRound size={20} />,
      panel: (
        <Panel
          title="People"
          contentHeight={resolvedContentHeight}
          animateDimensions={resolvedAnimateDimensions}
          showPanelTitle={resolvedShowPanelTitle}
        >
          The joined contour follows this panel as its dimensions change.
        </Panel>
      ),
    },
    {
      value: 'settings',
      label: 'Settings',
      icon: <Settings size={20} />,
      panel: (
        <Panel
          title="Settings"
          contentHeight={resolvedContentHeight}
          animateDimensions={resolvedAnimateDimensions}
          showPanelTitle={resolvedShowPanelTitle}
        >
          The final tab joins the panel at its lower edge.
        </Panel>
      ),
    },
  ];
}

function renderConnectedTabs({
  contentHeight,
  animateDimensions,
  showPanelTitle,
  value = 'overview',
  onValueChange = () => {},
  items: _storyItems,
  ariaLabel = 'Workbench sections',
  ...optionalTabsProps
}: ConnectedTabsStoryArgs) {
  return (
    <ConnectedTabs
      {...optionalTabsProps}
      value={value}
      onValueChange={onValueChange}
      ariaLabel={ariaLabel}
      items={createItems({ contentHeight, animateDimensions, showPanelTitle })}
    />
  );
}

const meta = preview.meta({
  title: 'App/Content/ConnectedTabs',
  component: ConnectedTabs as ComponentType<ConnectedTabsStoryArgs>,
  render: renderConnectedTabs,
  args: {
    value: 'overview',
    onValueChange: () => {},
    ariaLabel: 'Workbench sections',
    contentHeight: 180,
    animateDimensions: false,
    showPanelTitle: true,
  },
  argTypes: {
    value: { control: false, table: { disable: true } },
    onValueChange: { control: false, table: { disable: true } },
    items: { control: false, table: { disable: true } },
    ariaLabel: { control: false, table: { disable: true } },
    contentHeight: {
      name: 'Content height',
      description: 'Selected-panel content height in pixels.',
      control: { type: 'range', min: 40, max: 800, step: 20 },
    },
    animateDimensions: { control: false, table: { disable: true } },
    showPanelTitle: { control: false, table: { disable: true } },
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
    await waitFor(() => {
      expect(canvasElement.querySelector('[class*="glassSurface"]')).not.toBeNull();
      expect(canvasElement.querySelector('svg[class*="geometryContour"] path')).not.toBeNull();
    });

    const surface = canvasElement.querySelector<HTMLElement>('[class*="glassSurface"]');
    await expect(getComputedStyle(surface as HTMLElement).backdropFilter).toBe('blur(8px)');
  },
});

export const MiddleActive = meta.story({
  args: { value: 'people' },
});

export const FinalActive = meta.story({
  args: { value: 'settings' },
});

export const ContentDrivenHeight = meta.story({
  args: {
    value: 'overview',
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
    value: 'people',
    contentHeight: 320,
    animateDimensions: true,
  },
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
    value: 'overview',
    contentHeight: 180,
    showPanelTitle: false,
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
          'Uses Storybook’s App mobile viewport. Below the narrow container threshold, the left rail becomes the selected compact title stepper while the same controlled panel remains mounted.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const tabList = canvasElement.querySelector<HTMLElement>('[role="tablist"]');
    const root = tabList?.parentElement;
    const panel = canvasElement.querySelector<HTMLElement>('[role="tabpanel"]');
    const mobilePicker = canvasElement.querySelector<HTMLElement>(
      '[data-connected-tabs-mobile-picker]'
    );
    const canvas = within(canvasElement);

    await waitFor(() => {
      const canvasRect = canvasElement.getBoundingClientRect();
      const rootRect = root?.getBoundingClientRect();

      expect(root).not.toBeNull();
      expect(panel).not.toBeNull();
      expect(mobilePicker).not.toBeNull();
      expect(rootRect?.width).toBeCloseTo(canvasRect.width);
      expect(rootRect?.right).toBeLessThanOrEqual(canvasRect.right);
      expect(getComputedStyle(tabList as HTMLElement).display).toBe('none');
      expect(getComputedStyle(mobilePicker as HTMLElement).display).toBe('grid');
      expect(getComputedStyle(root as HTMLElement).backdropFilter).toBe('blur(8px)');
    });

    const picker = canvas.getByRole('combobox', { name: 'Workbench sections' });
    await expect(picker).toHaveTextContent('Overview');
    await userEvent.click(canvas.getByRole('button', { name: 'Next section' }));
    await expect(picker).toHaveTextContent('People');
    await expect(
      canvas.getByText('The joined contour follows this panel as its dimensions change.')
    ).toBeVisible();
  },
});

export const KeyboardAndPointerActivation = meta.story({
  args: { value: 'overview' },
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
  args: { value: 'people' },
  render: (args) => (
    <Box p="xl">
      {renderConnectedTabs(args)}
      <Box data-testid="overflow-marker" w={48} h={48} ml={540} mt={-80} bg="dune.7" />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('overflow-marker')).toBeVisible();
    const root = canvasElement.querySelector('[role="tablist"]')?.parentElement;
    await expect(getComputedStyle(root as Element).overflow).toBe('visible');
  },
});
