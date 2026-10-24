import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { convexNeverAnswers } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { signedIn } from './index.stories.fixture';
import { factions } from './product.stories.fixture';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Play/Lobby',
  args: { path: '/play' },
});

/** Finished games carry their result, with a crown on each winner's seat. */
export const Finished = meta.story({
  parameters: { ...signedIn },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('list', { name: 'Games' }, { timeout: 30_000 });
    await userEvent.click(page.getAllByLabelText('Show games').at(-1)!);
    await userEvent.click(await page.findByRole('option', { name: /^Finished/ }));
    const games = page.getByRole('list', { name: 'Games' });
    await expect(within(games).getAllByRole('listitem')).toHaveLength(1);
    await expect(
      within(games).getByText(`${factions[0]!.data.name} and ${factions[3]!.data.name} won together`)
    ).toBeVisible();
    await expect(within(games).getAllByRole('img', { name: /, a winner$/ })).toHaveLength(2);
  },
});

/** A lobby whose server never answers says so after ten seconds and offers the way home. */
export const ServerUnreachable = meta.story({
  decorators: [convexNeverAnswers],
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText("Can't reach the server. Retrying...", {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Go back home' })).toHaveAttribute('href', '/');
    await expect(page.queryByText('Loading games.')).toBeNull();
  },
});
