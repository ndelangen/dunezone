import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { db } from '@db/storybook';

import { expectFieldValue } from './pagePlay';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Groups',
  ...pageStoryMeta,
});

export const Detail = meta.story({
  args: { path: '/groups/arrakeen-rules-council' },
  parameters: {
    /* The shared baseline leaves `image_cover` null, and a ruleset without a cover renders the fallback glyph. */
    database: db((baseline) => {
      for (const row of baseline.rulesets) {
        row.image_cover = '/image/texture/021.jpg';
      }
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const faction = await page.findByRole('link', { name: 'House Atreides' }, { timeout: 30_000 });
    const ruleset = await page.findByRole('link', { name: 'ClassicRules' }, { timeout: 30_000 });

    /* Both lists are citations now. The asymmetry an earlier version of this story pinned was ruled out. */
    for (const citation of [faction, ruleset]) {
      await expect(citation.closest('li')).toBeNull();
      await expect(citation.querySelector('span[class*="media"]')).not.toBeNull();

      /*
       * A Stack stretches its children, so a chip once spanned the whole card and the empty half of the row navigated.
       * That shipped in #853 and an earlier version of this story passed with it live.
       * The fallback to the chip itself is what stops a row-less path from passing.
       */
      const row = citation.parentElement ?? citation;
      await expect(citation.getBoundingClientRect().width).toBeLessThan(row.getBoundingClientRect().width);
    }

    /* The faction wears its own mark rather than the shared glyph: the token renders an svg, the glyph a masked span. */
    await expect(faction.querySelector('svg')).not.toBeNull();

    /* Ownership reads from the band now. The card it used to sit in is gone rather than hidden. */
    const ownedBy = await page.findByText('Owned by', {}, { timeout: 30_000 });
    const line = ownedBy.parentElement;
    /* By href rather than accessible name: the avatar placeholder puts its initials into the name. */
    await expect(line?.querySelector('a[href="/profiles/storybook-viewer"]')).not.toBeNull();
    /* The standing follows the viewer, which the browser resolves after the shared page. */
    await waitFor(() => expect(line?.textContent).toContain('Owner'), { timeout: 30_000 });
    /* The member count is the band's too, so the roster card no longer repeats it in its title. */
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
    await expect(page.queryByRole('heading', { name: 'Stewardship' })).toBeNull();
  },
});
export const Edit = meta.story({
  args: { path: '/groups/arrakeen-rules-council/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Group name', 'Arrakeen Rules Council'),
});
