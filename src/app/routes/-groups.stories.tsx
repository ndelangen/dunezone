import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { db, ref } from '@db/storybook';

import { pageStoryMeta } from './-storybookConfig';

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
      expect(citation.closest('li')).toBeNull();
      expect(citation.querySelector('span[class*="media"]')).not.toBeNull();

      /*
       * A Stack stretches its children, so a chip once spanned the whole card and the empty half of the row navigated.
       * That shipped in #853 and an earlier version of this story passed with it live.
       * The fallback to the chip itself is what stops a row-less path from passing.
       */
      const row = citation.parentElement ?? citation;
      expect(citation.getBoundingClientRect().width).toBeLessThan(row.getBoundingClientRect().width);
    }

    /* The faction wears its own mark rather than the shared glyph: the token renders an svg, the glyph a masked span. */
    expect(faction.querySelector('svg')).not.toBeNull();

    /* Stewardship reads from the band now. The card it used to sit in is gone rather than hidden. */
    const stewardship = await page.findByText('Stewarded by', {}, { timeout: 30_000 });
    const line = stewardship.parentElement;
    /* By href rather than accessible name: the avatar placeholder puts its initials into the name. */
    expect(line?.querySelector('a[href="/profiles/storybook-viewer"]')).not.toBeNull();
    expect(line?.textContent).toContain('Owner');
    expect(page.queryByRole('heading', { name: 'Stewardship' })).toBeNull();
  },
});

/**
 * The group as a stranger sees it, which is the only state that renders the "Not a member" badge.
 *
 * The shared baseline makes the viewer the group's owner, so every other story on this page shows the Owner cell and this one is uncovered.
 * It exists because that cell is the one place the membership ladder's treatment differs from the ladder it was folded into: `neutral` is a bordered default rather than a light grey, deliberately, because the warm grey collapses into the dark scheme's navy surfaces.
 */
export const DetailNotAMember = meta.story({
  args: { path: '/groups/arrakeen-rules-council' },
  parameters: {
    database: db((baseline) => {
      /* Someone else owns the group, so the viewer is a stranger to it rather than its owner. */
      baseline.users.push({ $key: 'other-owner', name: 'Reverend Mother' });
      baseline.profiles.push({
        $key: 'other-owner-profile',
        user_id: ref('other-owner'),
        username: 'reverend-mother',
        avatar_url: null,
        account_state: 'active',
        slug: 'reverend-mother',
        created_at: '2026-01-01T12:00:00.000Z',
        updated_at: '2026-01-01T12:00:00.000Z',
      });
      for (const group of baseline.groups) {
        group.created_by = ref('other-owner');
      }
      /* And holds no membership of it, which is what puts the ladder on its `none` rung. */
      baseline.group_members = [];
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Not a member', {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByText('Owner')).toBeNull();
  },
});
export const Create = meta.story({ args: { path: '/groups/create' } });

/**
 * The create page reached by a reader who is not signed in: the gate frame, not the form.
 * Coverable since the session gate reads `useSessionViewer` and the seam's signed-out answer stopped collapsing into the pending shape (#803).
 */
export const CreateSignedOut = meta.story({
  args: { path: '/groups/create' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Back to profiles' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('button', { name: 'Save group' })).toBeNull();
  },
});
export const Edit = meta.story({
  args: { path: '/groups/arrakeen-rules-council/edit' },
});

/**
 * Each member is cited once, by one link that carries its own avatar.
 *
 * The roster used to mount a page-level avatar next to a `ProfileLink` given no image of its own, so every row drew the picture and the initials circle side by side.
 * This story gives the viewer an avatar, which the shared baseline leaves null: with null, both the defect and the fix render a placeholder and the assertion could not tell them apart.
 */
export const DetailMemberRowCitesOnce = meta.story({
  args: { path: '/groups/arrakeen-rules-council' },
  parameters: {
    database: db((baseline) => {
      for (const profile of baseline.profiles) {
        profile.avatar_url = '/vector/icon/spice.svg';
      }
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: /^Members/ }, { timeout: 30_000 })).resolves.toBeVisible();
    const document = canvasElement.ownerDocument;

    const avatars = [...document.querySelectorAll('img[src="/vector/icon/spice.svg"]')];
    /* Without this the filter below passes on a page that rendered no avatar at all. */
    expect(avatars.length).toBeGreaterThan(0);
    expect(avatars.filter((avatar) => !avatar.closest('a'))).toHaveLength(0);

    /*
     * By role and name, which this story could not do while the avatar and the initials both spoke:
     * a citation announced as "storybook-viewer storybook-viewer" matches no name a reader would use.
     */
    const citations = await page.findAllByRole('link', { name: 'storybook-viewer' }, { timeout: 30_000 });
    expect(citations.length).toBeGreaterThan(0);
    for (const citation of citations) {
      expect(citation.querySelectorAll('img')).toHaveLength(1);
    }
  },
});
