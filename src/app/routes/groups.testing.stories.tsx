import { testingPreview } from '@sb/preview';
import { expect, within } from 'storybook/test';

import { db, ref } from '@db/storybook';

import { expectFieldValue } from './pagePlay';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  title: 'Groups',
  ...pageStoryMeta,
});

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
    await expect(page.queryByRole('button', { name: 'Save group' })).toBeNull();
  },
});

/**
 * The group as a stranger sees it: the band names the owner and claims no standing for the viewer.
 *
 * The shared baseline makes the viewer the group's owner, so every other story on this page shows the Owner badge and this one is uncovered.
 * A stranger is every reader's default, so the band says nothing rather than wearing a "Not a member" badge.
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
    const ownedBy = await page.findByText('Owned by', {}, { timeout: 30_000 });
    await expect(ownedBy.parentElement?.querySelector('a[href="/profiles/reverend-mother"]')).not.toBeNull();
    await expect(page.queryByText('Not a member')).toBeNull();
    await expect(page.queryByText('Owner')).toBeNull();
    await expect(page.findByRole('button', { name: 'Request membership' })).resolves.toBeVisible();
  },
});
/** A group editor at rest is mounted once its Name field reads what the page loaded. */
export const Create = meta.story({
  args: { path: '/groups/create' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Group name', ''),
});

/**
 * Each member is cited once, by one link that carries its own avatar.
 *
 * The roster used to mount a page-level avatar next to a `ProfileLink` given no image of its own, so every row drew the picture and the initials circle side by side.
 * This story gives the viewer a known avatar so the assertion can count its appearances.
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
    await expect(avatars.length).toBeGreaterThan(0);
    await expect(avatars.filter((avatar) => !avatar.closest('a'))).toHaveLength(0);

    /*
     * By role and name, which this story could not do while the avatar and the initials both spoke:
     * a citation announced as "Central Central" matches no name a reader would use.
     */
    const citations = await page.findAllByRole('link', { name: 'Central' }, { timeout: 30_000 });
    await expect(citations.length).toBeGreaterThan(0);
    for (const citation of citations) {
      await expect(citation.querySelectorAll('img')).toHaveLength(1);
    }
  },
});
