import { testingPreview } from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { ConnectedTabs } from './ConnectedTabs';
import { examplePanels } from './ConnectedTabs.stories.fixture';
import type { ExampleTab } from './ConnectedTabs.stories.fixture';

const meta = testingPreview.meta({
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
