/// <reference types="vite/client" />

import type { WithoutSystemFields } from 'convex/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { placeholderOwner } from '../scripts/lib/snapshot-policy';
import { publishingCustomCard } from '../src/shared/assets/fixtures/publishingCustomCard';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { identifiesSomeone } from './lib/provisioningContract';

function prepared() {
  const t = applicationTest();
  return t;
}

describe('provisioning ownership remap', () => {
  beforeEach(() => {
    vi.stubEnv('IS_TEST', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('hands cloned factions and groups to reviewer A with B as a member', async () => {
    const t = prepared();
    const { prodUserId } = await t.run(async (ctx) => {
      const prodUser = await ctx.db.insert('users', { email: 'someone@prod.example' });
      await ctx.db.insert('users', { email: 'user-a@example.com' });
      await ctx.db.insert('users', { email: 'user-b@example.com' });
      const groupId = await ctx.db.insert('groups', {
        name: 'Cloned authors',
        slug: 'cloned-authors',
        created_at: '2026-06-01T10:00:00.000Z',
        created_by: prodUser,
        is_deleted: false,
      });
      await ctx.db.insert('factions', {
        owner_id: prodUser,
        data: { name: 'House Cloned' },
        slug: 'house-cloned',
        created_at: '2026-07-01T10:00:00.000Z',
        updated_at: '2026-07-02T10:00:00.000Z',
        is_deleted: false,
        group_id: groupId,
      });
      return { prodUserId: prodUser };
    });

    const { ownerId, collaboratorId } = await t.mutation(internal.provisioning.prepareLocalUsers, {
      ownerEmail: 'user-a@example.com',
      collaboratorEmail: 'user-b@example.com',
    });
    const factionPass = await t.mutation(internal.provisioning.remapFactionOwnershipBatch, {
      ownerEmail: 'user-a@example.com',
      paginationOpts: { numItems: 50, cursor: null },
    });
    const groupPass = await t.mutation(internal.provisioning.remapGroupOwnershipBatch, {
      ownerEmail: 'user-a@example.com',
      collaboratorEmail: 'user-b@example.com',
      paginationOpts: { numItems: 50, cursor: null },
    });

    expect(factionPass.isDone).toBe(true);
    expect(groupPass.isDone).toBe(true);
    await t.run(async (ctx) => {
      const faction = await ctx.db
        .query('factions')
        .withIndex('by_slug', (q) => q.eq('slug', 'house-cloned'))
        .unique();
      expect(faction?.owner_id).toBe(ownerId);
      expect(faction?.owner_id).not.toBe(prodUserId);

      const group = await ctx.db
        .query('groups')
        .withIndex('by_slug', (q) => q.eq('slug', 'cloned-authors'))
        .unique();
      expect(group?.created_by).toBe(ownerId);

      const memberships = await ctx.db
        .query('group_members')
        .withIndex('by_group_user', (q) => q.eq('group_id', group!._id))
        .collect();
      const byUser = new Map(memberships.map((member) => [member.user_id, member.status]));
      expect(byUser.get(ownerId)).toBe('active');
      expect(byUser.get(collaboratorId)).toBe('active');
    });
  });

  test('refuses to run outside test mode', async () => {
    vi.stubEnv('IS_TEST', 'false');
    const t = prepared();
    await expect(
      t.mutation(internal.provisioning.remapFactionOwnershipBatch, {
        ownerEmail: 'user-a@example.com',
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).rejects.toThrow('IS_TEST');
    await expect(t.mutation(internal.provisioning.insertSeedDocuments, { documents: '[]' })).rejects.toThrow('IS_TEST');
  });
});

describe('provisioning seed documents', () => {
  beforeEach(() => {
    vi.stubEnv('IS_TEST', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('resolves each reference to the id inserted under its key', async () => {
    const t = prepared();
    const documents = [
      { key: 'viewer', table: 'users', value: { name: 'Seeded viewer' } },
      {
        key: 'group',
        table: 'groups',
        value: {
          name: 'Seeded group',
          slug: { $seedRef: 'viewer', $seedText: 'group-of-__seed_ref__' },
          created_at: '2026-01-01T12:00:00.000Z',
          created_by: { $seedRef: 'viewer' },
          is_deleted: false,
        },
      },
    ];

    await t.mutation(internal.provisioning.insertSeedDocuments, { documents: JSON.stringify(documents) });

    await t.run(async (ctx) => {
      const viewer = await ctx.db.query('users').unique();
      const group = await ctx.db.query('groups').unique();
      expect(group?.created_by).toBe(viewer?._id);
      expect(group?.slug).toBe(`group-of-${viewer?._id}`);
    });
  });
});

describe('snapshot Rulebook draft seed', () => {
  const refusal = "where a snapshot load left the placeholder owner as the deployment's one account";

  async function deploymentWith(...accounts: WithoutSystemFields<Doc<'users'>>[]) {
    const t = prepared();
    await t.run(async (ctx) => {
      for (const account of accounts) {
        await ctx.db.insert('users', account);
      }
    });
    return t;
  }

  function seed(t: ReturnType<typeof prepared>) {
    return t.mutation(internal.provisioning.seedSnapshotRulebookDraftsBatch, {
      paginationOpts: { numItems: 10, cursor: null },
    });
  }

  test('refuses a deployment whose one account identifies someone, so never runs on production', async () => {
    const t = await deploymentWith({ email: 'someone@prod.example' });
    await expect(seed(t)).rejects.toThrow(refusal);
  });

  test('refuses once someone signs in after the load, though the placeholder owner still sorts first', async () => {
    const t = await deploymentWith(placeholderOwner.user(), { email: 'user-a@example.com' });
    const first = await t.run((ctx) => ctx.db.query('users').first());
    expect(first && identifiesSomeone(first)).toBe(false);
    await expect(seed(t)).rejects.toThrow(refusal);
  });
});

describe('isolated local publisher provisioning', () => {
  afterEach(() => vi.unstubAllEnvs());
  function isolated() {
    vi.stubEnv('IS_TEST', 'true');
    vi.stubEnv('E2E_LOCAL_AUTH', 'true');
    vi.stubEnv('SITE_URL', 'http://127.0.0.1:4300');
    vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:4301');
  }
  test('enables only a fresh isolated ledger and enqueues no baseline catalogue jobs', async () => {
    isolated();
    const t = prepared();
    await t.mutation(internal.provisioning.prepareLocalPublisher, {});
    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query('admin_settings')
        .withIndex('by_key', (q) => q.eq('key', 'publication'))
        .unique();
      expect(settings?.publication_pickup_enabled).toBe(true);
      expect(await ctx.db.query('publication_jobs').take(1)).toEqual([]);
      if (settings) {
        await ctx.db.patch(settings._id, { publication_pickup_enabled: false });
      }
    });
    const beforeResume = await t.run(
      async (ctx) =>
        await ctx.db
          .query('admin_settings')
          .withIndex('by_key', (q) => q.eq('key', 'publication'))
          .unique()
    );
    await t.mutation(internal.provisioning.prepareLocalPublisher, {});
    await t.run(async (ctx) => {
      expect(
        await ctx.db
          .query('admin_settings')
          .withIndex('by_key', (q) => q.eq('key', 'publication'))
          .unique()
      ).toEqual(beforeResume);
      expect(
        (
          await ctx.db
            .query('admin_settings')
            .withIndex('by_key', (q) => q.eq('key', 'publication'))
            .unique()
        )?.publication_pickup_enabled
      ).toBe(false);
    });
  });
  test('refuses hosted or partially enabled test settings before writing', async () => {
    isolated();
    const t = prepared();
    for (const [key, value] of [
      ['CONVEX_CLOUD_URL', 'https://production.convex.cloud'],
      ['SITE_URL', 'https://dune.zone'],
      ['E2E_LOCAL_AUTH', 'false'],
      ['IS_TEST', 'false'],
    ]) {
      isolated();
      vi.stubEnv(key!, value!);
      await expect(t.mutation(internal.provisioning.prepareLocalPublisher, {})).rejects.toThrow('isolated loopback');
    }
    await t.run(async (ctx) => {
      expect(await ctx.db.query('admin_settings').take(1)).toEqual([]);
    });
  });
});

describe('snapshot authoring ownership', () => {
  afterEach(() => vi.unstubAllEnvs());
  test('refuses every hosted target before reading a supplied reviewer identity', async () => {
    vi.stubEnv('IS_TEST', 'true');
    vi.stubEnv('E2E_LOCAL_AUTH', 'true');
    vi.stubEnv('SITE_URL', 'http://127.0.0.1:4300');
    vi.stubEnv('CONVEX_CLOUD_URL', 'https://shared.convex.cloud');
    const t = prepared();
    await expect(
      t.mutation(internal.provisioning.remapLocalAuthoringOwnershipBatch, {
        ownerEmail: 'reviewer@example.com',
        table: 'assets',
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).rejects.toThrow('isolated loopback');
  });
  test('changes only snapshot-owned assets and enqueues no publication work', async () => {
    vi.stubEnv('IS_TEST', 'true');
    vi.stubEnv('E2E_LOCAL_AUTH', 'true');
    vi.stubEnv('SITE_URL', 'http://127.0.0.1:4300');
    vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:4301');
    const t = prepared();
    const ids = await t.run(async (ctx) => {
      const placeholder = await ctx.db.insert('users', {});
      const reviewer = await ctx.db.insert('users', { email: 'reviewer@example.com' });
      const other = await ctx.db.insert('users', { email: 'other@example.com' });
      const data = publishingCustomCard;
      const base = {
        type: 'card-custom' as const,
        group_id: null,
        data,
        slug: 'source-token',
        created_at: '2026-10-20T00:00:00Z',
        updated_at: '2026-10-20T00:00:00Z',
        is_deleted: false,
      };
      const cloned = await ctx.db.insert('assets', { ...base, owner_id: placeholder });
      const secondCloned = await ctx.db.insert('assets', {
        ...base,
        slug: 'second-source-token',
        owner_id: placeholder,
      });
      const authored = await ctx.db.insert('assets', { ...base, slug: 'authored-token', owner_id: other });
      const ruleset = await ctx.db.insert('rulesets', {
        name: 'Snapshot ruleset',
        slug: 'snapshot-ruleset',
        about: '',
        created_at: base.created_at,
        updated_at: base.updated_at,
        owner_id: placeholder,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      });
      const book = await ctx.db.insert('rulebooks', {
        ruleset_id: ruleset,
        name: 'Snapshot book',
        name_key: 'snapshot book',
        slug: 'snapshot-book',
        sort_order: 0,
        current_edition_number: 1,
        created_by: placeholder,
        created_at: base.created_at,
        updated_at: base.updated_at,
        is_deleted: false,
        deleted_at: null,
      });
      const edition = await ctx.db.insert('rulebook_editions', {
        rulebook_id: book,
        edition_number: 1,
        created_by: placeholder,
        created_at: base.created_at,
      });
      return { cloned, secondCloned, authored, reviewer, other, placeholder, ruleset, book, edition };
    });
    const args = {
      ownerEmail: 'reviewer@example.com',
      table: 'assets' as const,
      paginationOpts: { numItems: 20, cursor: null },
    };
    expect((await t.mutation(internal.provisioning.remapLocalAuthoringOwnershipBatch, args)).updated).toBe(2);
    expect((await t.mutation(internal.provisioning.remapLocalAuthoringOwnershipBatch, args)).updated).toBe(0);
    for (const table of ['rulesets', 'rulebooks'] as const) {
      expect(
        (await t.mutation(internal.provisioning.remapLocalAuthoringOwnershipBatch, { ...args, table })).updated
      ).toBe(1);
      expect(
        (await t.mutation(internal.provisioning.remapLocalAuthoringOwnershipBatch, { ...args, table })).updated
      ).toBe(0);
    }
    await t.run(async (ctx) => {
      expect((await ctx.db.get(ids.cloned))?.owner_id).toBe(ids.reviewer);
      expect((await ctx.db.get(ids.secondCloned))?.owner_id).toBe(ids.reviewer);
      expect((await ctx.db.get(ids.authored))?.owner_id).toBe(ids.other);
      expect((await ctx.db.get(ids.ruleset))?.owner_id).toBe(ids.reviewer);
      expect((await ctx.db.get(ids.book))?.created_by).toBe(ids.reviewer);
      expect((await ctx.db.get(ids.edition))?.created_by).toBe(ids.placeholder);
      expect(await ctx.db.query('publication_jobs').take(1)).toEqual([]);
    });
  });
});
