import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { BookOpen, CircleUserRound, Settings } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { ConnectedTabs } from './ConnectedTabs';
import type { ConnectedTabsProps } from './ConnectedTabs';
import storyStyles from './ConnectedTabs.stories.module.css';
import { SurfaceFiller } from './SurfaceFiller.stories.fixture';

type ExampleTab = 'overview' | 'people' | 'settings';

/**
 * What the example panels are made of.
 * These are the story's own knobs, not props: the component takes finished panels, so a story that wants taller ones builds taller ones rather than asking the component for them.
 */
interface ExamplePanels {
  contentHeight?: number;
  animateDimensions?: boolean;
  showPanelTitle?: boolean;
}

/**
 * Neutral panel body.
 * The tabs' labels are the component's own API and stay real;
 * what sits inside a panel is the caller's, so the story shows a placeholder rather than prose.
 */
function Panel({
  value,
  contentHeight,
  animateDimensions,
  showPanelTitle,
}: {
  value: ExampleTab;
  contentHeight: number;
  animateDimensions: boolean;
  showPanelTitle: boolean;
}) {
  return (
    <Box data-testid={`panel-body-${value}`}>
      {showPanelTitle ? <SurfaceFiller height={28} width={180} /> : null}
      <Box mt={showPanelTitle ? 'sm' : 0}>
        <SurfaceFiller height={contentHeight} className={animateDimensions ? storyStyles.animatedContent : undefined} />
      </Box>
    </Box>
  );
}

function examplePanels({
  contentHeight,
  animateDimensions,
  showPanelTitle,
}: ExamplePanels = {}): ConnectedTabsProps<ExampleTab>['items'] {
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
          value="overview"
          contentHeight={resolvedContentHeight}
          animateDimensions={resolvedAnimateDimensions}
          showPanelTitle={resolvedShowPanelTitle}
        />
      ),
    },
    {
      value: 'people',
      label: 'People',
      icon: <CircleUserRound size={20} />,
      panel: (
        <Panel
          value="people"
          contentHeight={resolvedContentHeight}
          animateDimensions={resolvedAnimateDimensions}
          showPanelTitle={resolvedShowPanelTitle}
        />
      ),
    },
    {
      value: 'settings',
      label: 'Settings',
      icon: <Settings size={20} />,
      panel: (
        <Panel
          value="settings"
          contentHeight={resolvedContentHeight}
          animateDimensions={resolvedAnimateDimensions}
          showPanelTitle={resolvedShowPanelTitle}
        />
      ),
    },
  ];
}

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
    items: examplePanels({ contentHeight: 720 }),
  },
  parameters: {
    docs: {
      description: {
        story: 'The surface grows beyond the tab rail when its selected panel contains taller content.',
      },
    },
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
    await expect(canvas.getByTestId('panel-body-people')).toBeVisible();
  },
});

export const KeyboardAndPointerActivation = meta.story({
  args: { value: 'overview' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const overview = canvas.getByRole('tab', { name: 'Overview' });
    overview.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('tab', { name: 'People' })).toHaveAttribute('data-state', 'active');
    await userEvent.click(canvas.getByRole('tab', { name: 'Settings' }));
    await expect(canvas.getByTestId('panel-body-settings')).toBeVisible();
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
