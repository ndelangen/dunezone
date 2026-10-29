import { Box } from '@mantine/core';
import type { Meta } from '@storybook/tanstack-react';
import { BookOpen, CircleUserRound, Settings } from 'lucide-react';
import { useState } from 'react';

import { ConnectedTabs } from './ConnectedTabs';
import type { ConnectedTabsProps } from './ConnectedTabs';
import storyStyles from './ConnectedTabs.stories.module.css';
import { SurfaceFiller } from './SurfaceFiller.stories.fixture';

export type ExampleTab = 'overview' | 'people' | 'settings';

/**
 * What the example panels are made of.
 * These are the story's own knobs, not props: the component takes finished panels, so a story that wants taller ones builds taller ones rather than asking the component for them.
 */
export interface ExamplePanels {
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

export function examplePanels({
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

export const connectedTabsMeta = {
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
      const [value, setValue] = useState(context.args.value ?? 'overview');
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
} satisfies Meta<typeof ConnectedTabs>;
