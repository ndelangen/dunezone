import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { db } from '@db/storybook';

import { expectFieldValue } from './pagePlay';
import { findDeletionPage } from './profiles.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Profiles',
  ...pageStoryMeta,
});

export const Directory = meta.story({
  args: { path: '/profiles' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    await expect(main.findByRole('link', { name: /Central/ }, { timeout: 30_000 })).resolves.toHaveAttribute(
      'href',
      '/profiles/central'
    );
  },
});
/** A contributor's two FAQ sections use the shared question rows. */
export const Detail = meta.story({
  args: { path: '/profiles/central' },
  parameters: {
    database: db((baseline) => {
      for (const row of baseline.rulesets) {
        row.image_cover = '/image/texture/021.jpg';
      }
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Both profile sections use the standard mixed-ruleset question list. */
    await expect(page.queryByRole('region', { name: 'Sign-in methods' })).toBeNull();
    const citations = await page.findAllByRole('link', { name: 'ClassicRules' }, { timeout: 30_000 });
    await expect(citations.length).toBeGreaterThan(1);
    for (const section of ['Questions answered', 'Questions asked']) {
      const list = within(page.getByRole('region', { name: section }));
      await expect(list.getByRole('link', { name: 'When does the storm move?' })).toBeVisible();
      await expect(list.getByText('Asked by:')).toBeVisible();
      await expect(list.getByText('Answered by:')).toBeVisible();
      await expect(list.queryByText('Move the storm marker at the start of the storm phase.')).toBeNull();
      await expect(list.getByRole('link', { name: /Open question:/ })).toBeVisible();
    }
  },
});
/** At phone width both FAQ sections inherit the standard Lean rows. */
export const DetailNarrow = meta.story({
  args: { path: '/profiles/central' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    for (const section of ['Questions answered', 'Questions asked']) {
      const list = within(await page.findByRole('region', { name: section }, { timeout: 30_000 }));
      await expect(list.getByRole('link', { name: 'When does the storm move?' })).toBeVisible();
      await expect(list.getByText('Asked by:')).not.toBeVisible();
      await expect(list.getByText('Answered by:')).not.toBeVisible();
      await expect(
        list.getAllByText('1 answer', { exact: true }).find((element) => element.getClientRects().length > 0)
      ).toBeVisible();
      const rulesetLinks = list.getAllByRole('link', { name: 'ClassicRules' });
      await expect(rulesetLinks.some((link) => link.getClientRects().length > 0)).toBe(true);
    }
  },
});

export const Settings = meta.story({
  args: { path: '/profiles/central/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Display name', 'Central'),
});

export const DeleteAccount = meta.story({
  args: { path: '/profiles/central/delete' },
  play: async ({ canvasElement }) => {
    const page = await findDeletionPage(canvasElement);
    await expect(page.getByRole('button', { name: 'Choose a replacement owner' })).toBeVisible();
  },
});
