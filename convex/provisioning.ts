import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './functions';
import { ensureProfileForUser } from './lib/profileBootstrap';
import { nowIso } from './lib/utils';

const batchResultValidator = v.object({
  isDone: v.boolean(),
  continueCursor: v.string(),
});

function assertProvisioningMode() {
  if (process.env.IS_TEST !== 'true') {
    throw new Error('Provisioning helpers are only available when IS_TEST=true');
  }
}

async function findUserByEmail(ctx: MutationCtx, email: string): Promise<Doc<'users'>> {
  const normalizedEmail = email.trim().toLowerCase();
  const indexed = await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', normalizedEmail))
    .unique();
  if (indexed) {
    return indexed;
  }
  // Stored emails are not guaranteed lowercase; fall back to a bounded scan.
  const user = (await ctx.db.query('users').take(500)).find(
    (candidate) => candidate.email?.trim().toLowerCase() === normalizedEmail
  );
  if (!user) {
    throw new Error(`Local auth user not found: ${normalizedEmail}`);
  }
  return user;
}

async function ensureActiveMembership(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  userId: Id<'users'>,
  approvedBy: Id<'users'>
) {
  const timestamp = nowIso();
  const existing = await ctx.db
    .query('group_members')
    .withIndex('by_group_user', (q) => q.eq('group_id', groupId).eq('user_id', userId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      status: 'active',
      approved_at: timestamp,
      approved_by: approvedBy,
    });
    return;
  }

  await ctx.db.insert('group_members', {
    group_id: groupId,
    user_id: userId,
    status: 'active',
    requested_at: timestamp,
    approved_at: timestamp,
    approved_by: approvedBy,
  });
}

async function prepareLocalProfile(
  ctx: MutationCtx,
  user: Doc<'users'>,
  label: string,
  slug: string
) {
  const profile = await ensureProfileForUser(ctx, user._id, {
    displayName: label,
    imageUrl: null,
  });
  await ctx.db.patch(profile._id, {
    username: label,
    slug,
    updated_at: nowIso(),
  });
}

export const prepareLocalUsers = internalMutation({
  args: {
    ownerEmail: v.string(),
    collaboratorEmail: v.string(),
  },
  returns: v.object({
    ownerId: v.id('users'),
    collaboratorId: v.id('users'),
  }),
  handler: async (ctx, args) => {
    assertProvisioningMode();
    const owner = await findUserByEmail(ctx, args.ownerEmail);
    const collaborator = await findUserByEmail(ctx, args.collaboratorEmail);

    await prepareLocalProfile(ctx, owner, 'Local reviewer A', 'local-reviewer-a');
    await prepareLocalProfile(ctx, collaborator, 'Local reviewer B', 'local-reviewer-b');

    return {
      ownerId: owner._id,
      collaboratorId: collaborator._id,
    };
  },
});

export const remapFactionOwnershipBatch = internalMutation({
  args: {
    ownerEmail: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: batchResultValidator,
  handler: async (ctx, args) => {
    assertProvisioningMode();
    const owner = await findUserByEmail(ctx, args.ownerEmail);
    const result = await ctx.db.query('factions').paginate(args.paginationOpts);

    for (const faction of result.page) {
      if (faction.owner_id !== owner._id) {
        await ctx.db.patch(faction._id, { owner_id: owner._id });
      }
    }

    return { isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export const remapGroupOwnershipBatch = internalMutation({
  args: {
    ownerEmail: v.string(),
    collaboratorEmail: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: batchResultValidator,
  handler: async (ctx, args) => {
    assertProvisioningMode();
    const owner = await findUserByEmail(ctx, args.ownerEmail);
    const collaborator = await findUserByEmail(ctx, args.collaboratorEmail);
    const result = await ctx.db.query('groups').paginate(args.paginationOpts);

    for (const group of result.page) {
      if (group.created_by !== owner._id) {
        await ctx.db.patch(group._id, { created_by: owner._id });
      }
      await ensureActiveMembership(ctx, group._id, owner._id, owner._id);
      await ensureActiveMembership(ctx, group._id, collaborator._id, owner._id);
    }

    return { isDone: result.isDone, continueCursor: result.continueCursor };
  },
});
