import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { FactionAuthoringFixture } from './FactionAuthoring.stories.fixture';

const meta = testingPreview.meta({
  title: 'Complete Authoring Surface',
  component: FactionAuthoringFixture,
  globals: {
    viewport: {
      value: 'appDesktop',
    },
  },
  parameters: {
    layout: 'fullscreen',
  },
});

export const NameMustFormUrl = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole('textbox', { name: 'Faction name' });
    const save = canvas.getByRole('button', { name: 'Save faction' });
    const message = 'Faction name must contain at least one letter A-Z or number 0-9 to form its URL';
    const openReview = async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Review faction sheet' }));
      await waitForFrame(() => expect(canvas.getByRole('img', { name: 'Faction shield preview' })).toBeVisible());
    };
    await openReview();
    await userEvent.click(canvas.getByRole('button', { name: 'Return to editing' }));
    await userEvent.clear(name);
    await expect(name).toHaveValue('');
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(name, '家族');
    await expect(canvas.getByText(message, { exact: true })).toBeVisible();
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await openReview();
    await userEvent.click(canvas.getByRole('button', { name: 'Return to editing' }));
    await userEvent.type(name, ' 2');
    await expect(canvas.queryByText(message, { exact: true })).not.toBeInTheDocument();
    await expect(save).not.toHaveAttribute('aria-disabled', 'true');
  },
});
