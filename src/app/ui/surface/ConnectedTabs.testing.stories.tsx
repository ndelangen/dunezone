import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { connectedTabsMeta } from './ConnectedTabs.stories.fixture';

const meta = testingPreview.meta({ ...connectedTabsMeta, title: 'Connected Tabs' });

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
