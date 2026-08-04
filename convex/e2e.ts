import { v } from 'convex/values';

import type { Id, TableNames } from './_generated/dataModel';
import { query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { mutation } from './functions';
import { nowIso, slugify } from './lib/utils';

function assertTestMode() {
  if (process.env.IS_TEST !== 'true') {
    throw new Error('E2E helpers are only available when IS_TEST=true');
  }
}

async function deleteFromTable(ctx: MutationCtx, table: TableNames) {
  while (true) {
    const batch = await ctx.db.query(table).take(128);
    if (batch.length === 0) {
      break;
    }
    await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)));
  }
}

async function clearAllAppData(ctx: MutationCtx) {
  const tables = [
    'ruleset_factions',
    'faq_answers',
    'faq_items',
    'group_members',
    'rulesets',
    'factions',
    'groups',
    'profiles',
    'counters',
    'migration_runs',
  ] as const;

  for (const table of tables) {
    await deleteFromTable(ctx, table);
  }

  while (true) {
    const scheduled = await ctx.db.system.query('_scheduled_functions').take(128);
    if (scheduled.length === 0) {
      break;
    }
    await Promise.all(scheduled.map((job) => ctx.scheduler.cancel(job._id)));
  }

  while (true) {
    const storedFiles = await ctx.db.system.query('_storage').take(128);
    if (storedFiles.length === 0) {
      break;
    }
    await Promise.all(storedFiles.map((file) => ctx.storage.delete(file._id)));
  }
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    assertTestMode();
    const profileCount = (await ctx.db.query('profiles').take(500)).length;
    const rulesetCount = (await ctx.db.query('rulesets').take(500)).length;
    return {
      isTest: process.env.IS_TEST === 'true',
      profileCount,
      rulesetCount,
    };
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    assertTestMode();
    await clearAllAppData(ctx);
    return { ok: true };
  },
});

export const seedBaseline = mutation({
  args: {
    ownerEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertTestMode();
    await clearAllAppData(ctx);

    const ownerEmail = args.ownerEmail?.trim().toLowerCase() ?? null;
    if (!ownerEmail) {
      return { seeded: false, reason: 'ownerEmail not provided' as const };
    }

    const ownerUser = (await ctx.db.query('users').take(500)).find(
      (user) => user.email === ownerEmail
    );

    if (!ownerUser) {
      return { seeded: false, reason: 'owner not found' as const };
    }

    const now = nowIso();
    const username = ownerEmail.split('@')[0] ?? 'e2e-user';
    const profileSlugBase = slugify(username);
    const profileSlug = profileSlugBase.length > 0 ? profileSlugBase : 'e2e-user';
    const profileId = await ctx.db.insert('profiles', {
      user_id: ownerUser._id as Id<'users'>,
      username,
      avatar_url: null,
      slug: profileSlug,
      created_at: now,
      updated_at: now,
    });

    const groupId = await ctx.db.insert('groups', {
      name: 'E2E Baseline Group',
      slug: 'e2e-baseline-group',
      created_at: now,
      created_by: ownerUser._id as Id<'users'>,
    });

    await ctx.db.insert('group_members', {
      group_id: groupId,
      user_id: ownerUser._id as Id<'users'>,
      status: 'active',
      requested_at: now,
      approved_at: now,
      approved_by: ownerUser._id as Id<'users'>,
    });

    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'E2EBaselineRuleset',
      slug: 'e2ebaselineruleset',
      created_at: now,
      updated_at: now,
      owner_id: ownerUser._id as Id<'users'>,
      group_id: groupId,
      is_deleted: false,
      image_cover: null,
    });

    return {
      seeded: true,
      profileId,
      groupId,
      rulesetId,
    };
  },
});
