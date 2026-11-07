import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref } from '@db/storybook';

import { invitedGuest, strangerOwnsTheGroups, viewerStandsAs } from './groups.stories.fixture';
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
    /* Someone else owns the group, and the viewer holds no membership of it, which is what puts the ladder on its `none` rung. */
    database: db(strangerOwnsTheGroups),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const ownedBy = await page.findByText('Owned by', {}, { timeout: 30_000 });
    await expect(ownedBy.parentElement?.querySelector('a[href="/profiles/reverend-mother"]')).not.toBeNull();
    await expect(page.queryByText('Not a member')).toBeNull();
    await expect(page.queryByText('Owner')).toBeNull();
    await expect(page.findByRole('button', { name: 'Request membership' })).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Leave group' })).toBeNull();
  },
});

/**
 * The group as the person it invited sees it: the band says so, the notice carries both answers, and the toolbar no longer offers to ask.
 * Accepting is the simplest gesture the notice owns, and the band's badge is where the answer shows.
 */
export const DetailInvitedAccepts = meta.story({
  args: { path: '/groups/arrakeen-rules-council' },
  parameters: {
    database: db((baseline) => {
      strangerOwnsTheGroups(baseline);
      viewerStandsAs(baseline, 'invited');
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('You are invited to this group', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByText('Invited', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Request membership' })).toBeNull();
    await expect(page.getByRole('button', { name: 'Decline invitation' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Accept invitation' }));
    await expect(page.findByText('Active member', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByText('You are invited to this group')).toBeNull();
    await expect(page.findByRole('button', { name: 'Leave group' }, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

/** A requester may take their ask back; withdrawing returns the toolbar to the stranger's offer to ask. */
export const DetailRequesterWithdraws = meta.story({
  args: { path: '/groups/arrakeen-rules-council' },
  parameters: {
    database: db((baseline) => {
      strangerOwnsTheGroups(baseline);
      viewerStandsAs(baseline, 'pending');
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Pending approval', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.click(await page.findByRole('button', { name: 'Withdraw request' }, { timeout: 30_000 }));
    await expect(page.findByRole('button', { name: 'Request membership' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByText('Pending approval')).toBeNull();
  },
});

/**
 * A member who is not the owner may leave, and only they see the hold for it: the owner's toolbar carries the delete instead.
 * The hold itself is `HoldAction`'s to prove (ADR-0005);
 * this story proves the member gets one and the stranger's offer is gone.
 */
export const DetailMemberMayLeave = meta.story({
  args: { path: '/groups/arrakeen-rules-council' },
  parameters: {
    database: db((baseline) => {
      strangerOwnsTheGroups(baseline);
      viewerStandsAs(baseline, 'active');
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Active member', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('button', { name: 'Leave group' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Delete group' })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Request membership' })).toBeNull();
    await expect(page.getByRole('button', { name: 'Invite a member' })).toBeVisible();
  },
});

/**
 * The owner's view of an invitation they sent: the invited person is named in the invitations panel, not on the roster, and the invitation can be taken back.
 */
export const DetailOwnerWithdrawsAnInvitation = meta.story({
  args: { path: '/groups/arrakeen-rules-council' },
  parameters: { database: db(invitedGuest) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const title = await page.findByText('Invitations sent (1)', {}, { timeout: 30_000 });
    const panel = within(title.closest('[role="note"]') ?? canvasElement);
    await expect(panel.getByRole('link', { name: 'liet-kynes' })).toHaveAttribute('href', '/profiles/liet-kynes');
    const roster = within(page.getByRole('heading', { name: 'Members' }).closest('section') ?? canvasElement);
    await expect(roster.queryByRole('link', { name: 'liet-kynes' })).toBeNull();
    await userEvent.click(panel.getByRole('button', { name: 'Withdraw invitation' }));
    await waitFor(() => expect(page.queryByText('Invitations sent (1)')).toBeNull(), { timeout: 30_000 });
  },
});

/** Picking someone in the invite pane sends them an invitation, which the panel then lists; nobody joins the roster. */
export const DetailInviteSendsAnInvitation = meta.story({
  args: { path: '/groups/arrakeen-rules-council' },
  parameters: {
    database: db((baseline) => {
      baseline.users.push({ $key: 'guest', name: 'Liet Kynes' });
      baseline.profiles.push({
        $key: 'guest-profile',
        user_id: ref('guest'),
        username: 'liet-kynes',
        avatar_url: null,
        account_state: 'active',
        slug: 'liet-kynes',
        created_at: '2026-01-01T12:00:00.000Z',
        updated_at: '2026-01-01T12:00:00.000Z',
      });
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Invite a member' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('option', { name: /liet-kynes/ }, { timeout: 30_000 }));
    await expect(page.findByText('Invitations sent (1)', {}, { timeout: 30_000 })).resolves.toBeVisible();
    const roster = within(page.getByRole('heading', { name: 'Members' }).closest('section') ?? canvasElement);
    await expect(roster.queryByRole('link', { name: 'liet-kynes' })).toBeNull();
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
