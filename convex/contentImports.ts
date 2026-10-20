import { ConvexError, v } from 'convex/values';
import { z } from 'zod';

import {
  bindImportData,
  contentImportItemSchema,
  contentImportPackageSchema,
  importRulebookDataSchema,
  validateImportData,
} from '../src/shared/contentImports/package';
import type { ContentImportItem } from '../src/shared/contentImports/package';
import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import { DEFAULT_RULEBOOK_SETTINGS } from '../src/shared/rulebooks/settings';
import { RULESET_ASSET_SLOTS } from '../src/shared/rulesets/assetSlots';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { replaceAssetMembers } from './assets';
import { mutation } from './functions';
import { canonicalJson } from './lib/canonicalJson';
import {
  requireAssetUpdate,
  requireAssignableGroup,
  requireFactionUpdate,
  requireGroupReassignment,
  requireRulesetMaintenance,
} from './lib/collaborativeAccess';
import { requireAuthUserId } from './lib/policy';
import { rulebookContentsHash } from './lib/rulebookEditionContents';
import type { MutationCtx } from './types';

const targetValidator = v.object({ rulesetSlug: v.string(), groupSlug: v.string() });
const resultValidator = v.object({
  id: v.string(),
  slug: v.string(),
  status: v.union(v.literal('created'), v.literal('updated'), v.literal('unchanged')),
  hash: v.string(),
});
type ImportResult = { id: string; slug: string; status: 'created' | 'updated' | 'unchanged'; hash: string };
type Target = Awaited<ReturnType<typeof targetFor>>;
type Receipt = Doc<'content_import_receipts'>;
type Subject = {
  id: string;
  slug: string;
  data: unknown;
  groupId: Id<'groups'> | null;
  revision?: number;
  linked?: boolean;
  slots?: string[];
  members?: { id: string; count: number }[];
};

async function targetFor(ctx: MutationCtx, target: { rulesetSlug: string; groupSlug: string }) {
  const viewerId = await requireAuthUserId(ctx);
  const ruleset = await ctx.db
    .query('rulesets')
    .withIndex('by_slug', (q) => q.eq('slug', target.rulesetSlug))
    .unique();
  const group = await ctx.db
    .query('groups')
    .withIndex('by_slug', (q) => q.eq('slug', target.groupSlug))
    .unique();
  if (!ruleset || ruleset.is_deleted || !group || group.is_deleted) {
    throw new ConvexError('Choose an available Ruleset and Group.');
  }
  await requireRulesetMaintenance(ctx, ruleset._id);
  await requireAssignableGroup(ctx, group._id);
  if (ruleset.group_id !== group._id) {
    throw new ConvexError('The Ruleset must belong to the selected Group.');
  }
  return { ruleset, group, viewerId };
}

async function receiptFor(ctx: MutationCtx, target: Target, packageKey: string, key: string) {
  return await ctx.db
    .query('content_import_receipts')
    .withIndex('by_ruleset_package_item', (q) =>
      q.eq('ruleset_id', target.ruleset._id).eq('package_key', packageKey).eq('item_key', key)
    )
    .unique();
}

async function subjectById(ctx: MutationCtx, item: ContentImportItem, id: string, target: Target): Promise<Subject> {
  if (item.kind === 'rulebook') {
    const normalized = ctx.db.normalizeId('rulebooks', id);
    const row = normalized ? await ctx.db.get('rulebooks', normalized) : null;
    if (!row || row.is_deleted) {
      throw new ConvexError('The imported Rulebook is no longer available.');
    }
    const draft = await ctx.db
      .query('rulebook_drafts')
      .withIndex('by_rulebook', (q) => q.eq('rulebook_id', row._id))
      .unique();
    if (!draft) {
      throw new ConvexError('The Rulebook has no saved draft.');
    }
    return {
      id: row._id,
      slug: row.slug,
      data: { name: row.name, settings: row.settings ?? DEFAULT_RULEBOOK_SETTINGS, contents: draft.contents },
      groupId: null,
      revision: draft.revision,
    };
  }
  if (item.kind === 'faction') {
    const normalized = ctx.db.normalizeId('factions', id);
    const row = normalized ? await ctx.db.get('factions', normalized) : null;
    if (!row || row.is_deleted) {
      throw new ConvexError('The imported faction is no longer available.');
    }
    const link = await ctx.db
      .query('ruleset_factions')
      .withIndex('by_ruleset_faction', (q) => q.eq('ruleset_id', target.ruleset._id).eq('faction_id', row._id))
      .unique();
    return { id: row._id, slug: row.slug, data: row.data, groupId: row.group_id, linked: link !== null };
  }
  const normalized = ctx.db.normalizeId('assets', id);
  const row = normalized ? await ctx.db.get('assets', normalized) : null;
  if (!row || row.is_deleted || row.type !== item.type) {
    throw new ConvexError('The imported asset is no longer available with its original type.');
  }
  const members =
    item.type === 'deck' || item.type === 'bundle'
      ? await ctx.db
          .query('asset_relations')
          .withIndex('by_from_kind', (q) =>
            q.eq('from_asset_id', row._id).eq('kind', item.type === 'deck' ? 'deck-card' : 'bundle-token')
          )
          .take(501)
      : [];
  if (members.length > 500) {
    throw new ConvexError('This container has too many members to import.');
  }
  const slots = await ctx.db
    .query('ruleset_asset_slots')
    .withIndex('by_asset', (q) => q.eq('asset_id', row._id))
    .take(501);
  if (slots.length > 500) {
    throw new ConvexError('This asset has too many Ruleset links to import.');
  }
  return {
    id: row._id,
    slug: row.slug,
    data: row.data,
    groupId: row.group_id,
    slots: slots
      .filter((slot) => slot.ruleset_id === target.ruleset._id)
      .map((slot) => slot.slot)
      .sort(),
    members: members
      .map((member) => ({ id: member.to_asset_id, count: member.count }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

async function findSubject(
  ctx: MutationCtx,
  target: Target,
  item: ContentImportItem,
  receipt: Receipt | null
): Promise<Subject | null> {
  if (receipt) {
    if (receipt.kind !== item.kind) {
      throw new ConvexError('A package key cannot change kind.');
    }
    return await subjectById(ctx, item, receipt.subject_id, target);
  }
  if (!item.existing) {
    return null;
  }
  const row =
    item.kind === 'rulebook'
      ? await ctx.db
          .query('rulebooks')
          .withIndex('by_ruleset_and_slug', (q) =>
            q.eq('ruleset_id', target.ruleset._id).eq('slug', item.existing!.slug)
          )
          .unique()
      : item.kind === 'faction'
        ? await ctx.db
            .query('factions')
            .withIndex('by_slug', (q) => q.eq('slug', item.existing!.slug))
            .unique()
        : await ctx.db
            .query('assets')
            .withIndex('by_type_and_slug', (q) => q.eq('type', item.type).eq('slug', item.existing!.slug))
            .unique();
  if (!row) {
    throw new ConvexError(`Existing ${item.kind} ${item.existing.slug} was not found.`);
  }
  return await subjectById(ctx, item, row._id, target);
}

function subjectHash(subject: Subject) {
  return rulebookContentsHash(subject);
}
async function destinationFor(
  ctx: MutationCtx,
  target: Target,
  item: ContentImportItem,
  subject: Subject | null
): Promise<{ expectedHash: string | null; message?: string }> {
  if (item.kind !== 'asset' || !item.slot || !RULESET_ASSET_SLOTS[item.slot].single) {
    return { expectedHash: subject ? subjectHash(subject) : null };
  }
  const slot = item.slot;
  const links = await ctx.db
    .query('ruleset_asset_slots')
    .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', target.ruleset._id).eq('slot', slot))
    .take(2);
  if (links.length > 1) {
    throw new ConvexError('The destination slot has conflicting occupants. Resolve it in the Ruleset editor first.');
  }
  const occupant = links[0] ? await ctx.db.get('assets', links[0].asset_id) : null;
  return {
    expectedHash: rulebookContentsHash({
      subject: subject ? subjectHash(subject) : null,
      slot,
      occupants: links.map((link) => link.asset_id),
    }),
    ...(occupant && occupant._id !== subject?.id
      ? { message: `Replaces ${itemName(occupant.data)} in the ${RULESET_ASSET_SLOTS[slot].label} slot.` }
      : {}),
  };
}

function itemName(data: unknown): string {
  return typeof data === 'object' && data !== null && 'name' in data && typeof data.name === 'string'
    ? data.name
    : 'Unnamed';
}

async function authorizeSubject(
  ctx: MutationCtx,
  target: Target,
  item: ContentImportItem,
  subject: Subject,
  data: unknown
) {
  if (item.kind === 'rulebook') {
    const row = await ctx.db.get('rulebooks', subject.id as Id<'rulebooks'>);
    if (row?.ruleset_id !== target.ruleset._id) {
      throw new ConvexError('The Rulebook belongs to another Ruleset.');
    }
    if (itemName(data) !== itemName(subject.data)) {
      throw new ConvexError('Rename an existing Rulebook in its editor before importing it.');
    }
    return;
  }
  if (item.kind === 'faction') {
    await requireFactionUpdate(ctx, subject.id as Id<'factions'>, { name: itemName(data) });
  } else {
    await requireAssetUpdate(ctx, subject.id as Id<'assets'>, itemName(data));
  }
  if (subject.groupId !== target.group._id) {
    if (item.kind === 'faction') {
      await requireGroupReassignment(ctx, { kind: 'faction', id: subject.id as Id<'factions'> }, target.group._id);
    } else {
      await requireGroupReassignment(ctx, { kind: 'asset', id: subject.id as Id<'assets'> }, target.group._id);
    }
  }
}

export const preview = mutation({
  args: { package: v.any(), target: targetValidator, cursor: v.optional(v.number()) },
  returns: v.object({
    packageKey: v.string(),
    rulesetId: v.id('rulesets'),
    groupId: v.id('groups'),
    nextCursor: v.union(v.number(), v.null()),
    rulesetName: v.string(),
    groupName: v.string(),
    ownerId: v.string(),
    entries: v.array(
      v.object({
        key: v.string(),
        kind: v.string(),
        name: v.string(),
        status: v.union(v.literal('create'), v.literal('update'), v.literal('unchanged'), v.literal('conflict')),
        expectedHash: v.union(v.string(), v.null()),
        message: v.optional(v.string()),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const bundle = contentImportPackageSchema.parse(args.package);
    const cursor = args.cursor ?? 0;
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > bundle.items.length) {
      throw new ConvexError('The preview cursor must be a whole number within this package.');
    }
    const target = await targetFor(ctx, args.target);
    const maximumEnd = Math.min(cursor + 50, bundle.items.length);
    let end = cursor;
    const entries = [];
    for (const item of bundle.items.slice(cursor, maximumEnd)) {
      try {
        const data = bindImportData(item, (key) => ({ id: key, slug: key }));
        validateImportData(item, data);
        const receipt = await receiptFor(ctx, target, bundle.packageKey, item.key);
        const subject = await findSubject(ctx, target, item, receipt);
        if (subject) {
          await authorizeSubject(ctx, target, item, subject, data);
        }
        const hash = subject ? subjectHash(subject) : null;
        const destination = await destinationFor(ctx, target, item, subject);
        const conflict = !!receipt && hash !== receipt.state_hash && item.expectedStateHash !== hash;
        entries.push({
          key: item.key,
          kind: item.kind,
          name: itemName(data),
          expectedHash: destination.expectedHash,
          status: conflict
            ? ('conflict' as const)
            : !subject
              ? ('create' as const)
              : !item.bindings?.length &&
                  receipt?.item_hash === rulebookContentsHash(item) &&
                  receipt.state_hash === hash
                ? ('unchanged' as const)
                : ('update' as const),
          ...(conflict
            ? { message: 'This record changed since its last import. Export and review it before continuing.' }
            : destination.message
              ? { message: destination.message }
              : {}),
        });
      } catch (error) {
        entries.push({
          key: item.key,
          kind: item.kind,
          name: itemName(item.data),
          expectedHash: null,
          status: 'conflict' as const,
          message:
            error instanceof z.ZodError
              ? z.prettifyError(error)
              : error instanceof Error
                ? error.message
                : 'Cannot import this record.',
        });
      }
      end += 1;
      const metrics = await ctx.meta.getTransactionMetrics();
      if (
        metrics.bytesRead.remaining < 4 * 1024 * 1024 ||
        metrics.documentsRead.remaining < 1500 ||
        metrics.databaseQueries.remaining < 100
      ) {
        break;
      }
    }
    return {
      packageKey: bundle.packageKey,
      rulesetId: target.ruleset._id,
      groupId: target.group._id,
      nextCursor: end < bundle.items.length ? end : null,
      rulesetName: target.ruleset.name,
      groupName: target.group.name,
      ownerId: target.viewerId,
      entries,
    };
  },
});

export const applyItem = mutation({
  args: { packageKey: v.string(), item: v.any(), target: targetValidator, expectedHash: v.union(v.string(), v.null()) },
  returns: resultValidator,
  handler: async (ctx, args): Promise<ImportResult> => {
    const item = contentImportItemSchema.parse(args.item);
    const target = await targetFor(ctx, args.target);
    const receipt = await receiptFor(ctx, target, args.packageKey, item.key);
    const previous = await findSubject(ctx, target, item, receipt);
    const hash = previous ? subjectHash(previous) : null;
    const inputHash = rulebookContentsHash(item);
    const destination = await destinationFor(ctx, target, item, previous);
    const reviewedReconciliation = item.expectedStateHash === hash && args.expectedHash === destination.expectedHash;
    if (receipt && receipt.state_hash !== hash && !reviewedReconciliation) {
      throw new ConvexError('This record changed since its last import. Export and review it before continuing.');
    }
    const bindings = new Map<string, { id: string; slug: string; dataHash?: string }>();
    const contentDependencies = new Set((item.bindings ?? []).map((binding) => binding.key));
    for (const key of new Set([
      ...(item.bindings ?? []).map((binding) => binding.key),
      ...(item.kind === 'asset' ? (item.members ?? []).map((member) => member.key) : []),
    ])) {
      const dependency = await receiptFor(ctx, target, args.packageKey, key);
      if (!dependency) {
        throw new ConvexError(`Import dependency ${key} first.`);
      }
      const table = dependency.kind === 'faction' ? 'factions' : dependency.kind === 'asset' ? 'assets' : 'rulebooks';
      const id = ctx.db.normalizeId(table, dependency.subject_id);
      const row = id ? await ctx.db.get(table, id) : null;
      if (!row || row.is_deleted) {
        throw new ConvexError(`Dependency ${key} is unavailable.`);
      }
      bindings.set(key, {
        id: row._id,
        slug: row.slug,
        ...(contentDependencies.has(key) ? { dataHash: rulebookContentsHash('data' in row ? row.data : row) } : {}),
      });
    }
    const data = validateImportData(
      item,
      bindImportData(item, (key) => {
        const binding = bindings.get(key);
        if (!binding) {
          throw new ConvexError(`Dependency ${key} is unavailable.`);
        }
        return binding;
      })
    );
    if (previous) {
      await authorizeSubject(ctx, target, item, previous, data);
    }
    const resolvedHash = rulebookContentsHash([...bindings.entries()]);
    if (
      receipt?.item_hash === inputHash &&
      receipt.resolved_hash === resolvedHash &&
      receipt.state_hash === hash &&
      previous
    ) {
      return { id: previous.id, slug: previous.slug, status: 'unchanged', hash: hash! };
    }
    if (args.expectedHash !== destination.expectedHash) {
      throw new ConvexError('The import preview is stale. Preview the package again.');
    }
    let id: string;
    if (item.kind === 'faction') {
      if (previous) {
        id = previous.id;
        await ctx.runMutation(api.factions.update, { id: id as Id<'factions'>, data });
        if (previous.groupId !== target.group._id) {
          await ctx.runMutation(api.factions.setGroup, { id: id as Id<'factions'>, group_id: target.group._id });
        }
      } else {
        const created = await ctx.runMutation(api.factions.create, { data, group_id: target.group._id });
        id = created._id;
      }
      if (item.link) {
        await ctx.runMutation(api.rulesets.addFaction, {
          ruleset_id: target.ruleset._id,
          faction_id: id as Id<'factions'>,
        });
      }
    } else if (item.kind === 'asset') {
      if (previous) {
        id = previous.id;
        await ctx.runMutation(api.assets.update, { id: id as Id<'assets'>, data });
        if (previous.groupId !== target.group._id) {
          await ctx.runMutation(api.assets.setGroup, { id: id as Id<'assets'>, group_id: target.group._id });
        }
      } else {
        const created = await ctx.runMutation(api.assets.create, { type: item.type, data, group_id: target.group._id });
        id = created.id;
      }
      if (item.members) {
        await replaceAssetMembers(
          ctx,
          id as Id<'assets'>,
          item.members.map((member) => ({ id: bindings.get(member.key)!.id as Id<'assets'>, count: member.count }))
        );
      }
      if (item.slot) {
        await ctx.runMutation(api.rulesets.setAssetSlot, {
          ruleset_id: target.ruleset._id,
          asset_id: id as Id<'assets'>,
          slot: item.slot,
        });
      }
    } else {
      const book = importRulebookDataSchema.parse(data);
      if (previous) {
        id = previous.id;
        if (canonicalJson((previous.data as { settings: unknown }).settings) !== canonicalJson(book.settings)) {
          throw new ConvexError('An existing Rulebook keeps its size and design. Create a new book to change them.');
        }
        const saved = await ctx.runMutation(api.rulebooks.save, {
          rulebook_id: id as Id<'rulebooks'>,
          expected_revision: previous.revision!,
          contents: book.contents,
        });
        if (saved.kind !== 'saved') {
          throw new ConvexError('The Rulebook changed. Preview the package again.');
        }
        await ctx.runMutation(api.rulebooks.publish, {
          rulebook_id: id as Id<'rulebooks'>,
          expected_revision: saved.draft.revision,
          confirmed: true,
        });
      } else {
        const created = await ctx.runMutation(api.rulebooks.create, {
          catalogue_version: RULEBOOK_CATALOGUE_VERSION,
          ruleset_id: target.ruleset._id,
          name: book.name,
          source: { kind: 'json', settings: book.settings, contents: book.contents },
        });
        id = created.rulebook._id;
      }
    }
    const current = await subjectById(ctx, item, id, target);
    const savedHash = subjectHash(current);
    const value = {
      ruleset_id: target.ruleset._id,
      package_key: args.packageKey,
      item_key: item.key,
      kind: item.kind,
      subject_id: id,
      item_hash: inputHash,
      resolved_hash: resolvedHash,
      state_hash: savedHash,
      updated_by: target.viewerId,
    };
    if (receipt) {
      await ctx.db.replace('content_import_receipts', receipt._id, value);
    } else {
      await ctx.db.insert('content_import_receipts', value);
    }
    return { id, slug: current.slug, status: previous ? 'updated' : 'created', hash: savedHash };
  },
});

export const exportRecord = mutation({
  args: {
    target: targetValidator,
    kind: v.union(v.literal('faction'), v.literal('rulebook'), v.literal('asset')),
    slug: v.string(),
    type: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const target = await targetFor(ctx, args.target);
    const item = contentImportItemSchema.parse({
      key: args.slug,
      kind: args.kind,
      ...(args.kind === 'asset' ? { type: args.type } : {}),
      existing: { slug: args.slug },
      data: {},
    });
    const subject = await findSubject(ctx, target, item, null);
    if (!subject) {
      throw new ConvexError('The record is unavailable.');
    }
    await authorizeSubject(ctx, target, item, subject, subject.data);
    return {
      package: {
        format: 'dunezone-package',
        version: 1,
        packageKey: `export-${args.slug}`,
        items: [{ ...item, data: subject.data, expectedStateHash: subjectHash(subject) }],
      },
      warnings: [
        'Database references still name this deployment. Add explicit bindings before importing elsewhere.',
        ...(subject.members?.length
          ? [
              'Container membership is separate. Include member items and their counts when building a portable package.',
            ]
          : []),
      ],
    };
  },
});
