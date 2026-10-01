import { paginationOptsValidator } from 'convex/server';
import type { WithoutSystemFields } from 'convex/server';
import { v } from 'convex/values';

import { resolveSeedValue } from '../src/shared/seedReferences';
import type { Doc, Id, TableNames } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './functions';
import { ensureProfileForUser } from './lib/profileBootstrap';
import { identifiesSomeone } from './lib/provisioningContract';
import { nowIso } from './lib/utils';
import { seedRulebookDraftFromCurrentEdition } from './rulebooks';

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

async function prepareLocalProfile(ctx: MutationCtx, user: Doc<'users'>, label: string, slug: string) {
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

/**
 * The snapshot's placeholder owner, which a snapshot load leaves as the deployment's one account, with no email, phone, name or image.
 * Production holds real accounts, so a seed that needs this refuses to run there, as it does on a deployment someone has signed in to since the load.
 * The cloud dev rebuild runs the seeds too and never sets `IS_TEST` the way a local launch does, so the test-mode guard the local helpers here use would rest on a setting the rebuild does not control.
 */
async function requireSnapshotPlaceholderOwner(ctx: MutationCtx): Promise<Id<'users'>> {
  const users = await ctx.db.query('users').take(2);
  const [owner] = users;
  if (users.length !== 1 || !owner || identifiesSomeone(owner)) {
    throw new Error(
      "Snapshot seeds run only where a snapshot load left the placeholder owner as the deployment's one account"
    );
  }
  return owner._id;
}

/**
 * Seeds the draft each live Rulebook in this batch lacks after a snapshot load, saved by the placeholder owner.
 * The snapshot leaves drafts out because they are private, so each draft holds the Rulebook's current Edition as the public reader shows it, and nothing else.
 * A Rulebook that already has a draft keeps it, so a second run seeds nothing.
 */
export const seedSnapshotRulebookDraftsBatch = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: batchResultValidator.extend({ seeded: v.number() }),
  handler: async (ctx, args) => {
    const ownerId = await requireSnapshotPlaceholderOwner(ctx);
    const result = await ctx.db.query('rulebooks').paginate(args.paginationOpts);
    let seeded = 0;
    for (const rulebook of result.page) {
      if (!rulebook.is_deleted && (await seedRulebookDraftFromCurrentEdition(ctx, rulebook, ownerId))) {
        seeded += 1;
      }
    }
    return { isDone: result.isDone, continueCursor: result.continueCursor, seeded };
  },
});

type SeedDocument = { key?: string; table: TableNames; value: unknown };

/** The schema validates the resolved row on insert, which is the check a seed document gets. */
async function insertSeedDocument<TableName extends TableNames>(ctx: MutationCtx, table: TableName, value: unknown) {
  return await ctx.db.insert(table, value as WithoutSystemFields<Doc<TableName>>);
}

/**
 * Inserts a seed database, such as the Storybook page-story baseline, in the order given.
 * A reference names a document earlier in the list and resolves to the id inserted under that key.
 * The documents arrive as JSON text because a Convex value cannot hold the `$seedRef` field names that mark a reference.
 */
export const insertSeedDocuments = internalMutation({
  args: { documents: v.string() },
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx, args) => {
    assertProvisioningMode();
    const documents = JSON.parse(args.documents) as SeedDocument[];
    const ids = new Map<string, string>();
    for (const document of documents) {
      const id = await insertSeedDocument(ctx, document.table, resolveSeedValue(document.value, ids));
      if (document.key) {
        ids.set(document.key, id);
      }
    }
    return { inserted: documents.length };
  },
});
