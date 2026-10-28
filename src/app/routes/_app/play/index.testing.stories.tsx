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
    /* The refine popover holds a second, hidden Show games until it opens; the one to press is the field showing. */
    const showGames = page.getAllByLabelText('Show games').find((field) => field.checkVisibility());
    await userEvent.click(showGames!);
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

/** In a narrow window the lobby sets its cards two to a row, too narrow for a ring beside its caption, so each caption stays beneath its ring. */
export const TwoCardsToARow = meta.story({
  parameters: { ...signedIn },
  globals: { viewport: { value: 'contentColumn' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const games = await page.findByRole('list', { name: 'Games' }, { timeout: 30_000 });
    const cards = within(games).getAllByRole('listitem');
    /* The story is only about two to a row, so it says so itself rather than trusting the viewport it asked for. */
    const tops = cards.map((card) => Math.round(card.getBoundingClientRect().top));
    await expect(tops.filter((top) => top === tops[0])).toHaveLength(2);
    for (const card of cards) {
      const ring = within(card)
        .getByLabelText(/^Seats at /)
        .getBoundingClientRect();
      const seated = within(card)
        .getByText(/ seated$/)
        .getBoundingClientRect();
      await expect(seated.top).toBeGreaterThanOrEqual(ring.bottom);
    }
  },
});
