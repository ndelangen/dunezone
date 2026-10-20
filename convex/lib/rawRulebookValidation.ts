import { ConvexError } from 'convex/values';

import {
  isPublicationAssetType,
  resolvePublicationCapture,
} from '../../src/shared/asset-publishing/publicationTargets';
import { CanonicalFactionStoredSchema } from '../../src/shared/factions/schema';
import { resolveRulebookBoardDefinition } from '../../src/shared/rulebooks/boardDefinitions';
import { rulebookContentsV1Schema } from '../../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../../src/shared/rulebooks/contents';
import { rulebookReferenceUses } from '../../src/shared/rulebooks/references';
import { DEFAULT_RULEBOOK_SETTINGS } from '../../src/shared/rulebooks/settings';
import type { RulebookSettings } from '../../src/shared/rulebooks/settings';
import { resolveRulebookArtworkSource } from '../../src/shared/rulebooks/sources';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { loadRulesetAccessForLoadedSubject } from './collaborativeAccess';
import {
  assertFixedBlockOwnership,
  assertFixedPageLayouts,
  assertStoredRulebookCoverImages,
} from './rulebookDraftValidation';

/** The same relative contract as Save, read against the destination's current saved pair. */
export async function assertRawRulebookDestination(
  ctx: QueryCtx,
  targetId: string | undefined,
  next: { contents: RulebookContentsV1; settings: RulebookSettings }
) {
  const id = targetId ? ctx.db.normalizeId('rulebooks', targetId) : null;
  const rulebook = id ? await ctx.db.get('rulebooks', id) : null;
  if (!rulebook || rulebook.is_deleted) {
    throw new ConvexError('Choose an available destination Rulebook.');
  }
  const ruleset = await ctx.db.get('rulesets', rulebook.ruleset_id);
  if (
    !ruleset ||
    ruleset.is_deleted ||
    !(await loadRulesetAccessForLoadedSubject(ctx, ruleset)).viewerAccess.capabilities.edit
  ) {
    throw new ConvexError('Not authorized to edit this Rulebook.');
  }
  const draft = await ctx.db
    .query('rulebook_drafts')
    .withIndex('by_rulebook', (q) => q.eq('rulebook_id', rulebook._id))
    .unique();
  if (!draft) {
    throw new ConvexError('Rulebook draft not found.');
  }
  const previous = rulebookContentsV1Schema.parse(draft.contents);
  assertFixedPageLayouts(previous, next.contents, next.settings, rulebook.settings ?? DEFAULT_RULEBOOK_SETTINGS);
  assertFixedBlockOwnership(previous, next.contents);
  assertStoredRulebookCoverImages(next.contents);
}

/** Checks typed identities and selected faces without requiring publication to have finished. */
export async function assertRawRulebookReferences(ctx: QueryCtx, contents: RulebookContentsV1) {
  const assets = new Map<string, Promise<Doc<'assets'> | null>>();
  const factions = new Map<string, Promise<ReturnType<typeof CanonicalFactionStoredSchema.parse>>>();
  const asset = async (id: string, path: string, types?: readonly string[]) => {
    if (!assets.has(id)) {
      const key = ctx.db.normalizeId('assets', id);
      assets.set(id, key ? ctx.db.get('assets', key) : Promise.resolve(null));
    }
    const row = await assets.get(id)!;
    const image = row && isPublicationAssetType(row.type) && resolvePublicationCapture(row.type).output === 'image';
    if (!row || row.is_deleted || (types ? !types.includes(row.type) : !image)) {
      throw new ConvexError(`${path}: Choose an available ${types?.join(' or ') ?? 'image asset'}.`);
    }
  };
  const faction = (id: string, path: string) => {
    if (!factions.has(id)) {
      factions.set(
        id,
        (async () => {
          const key = ctx.db.normalizeId('factions', id);
          const row = key ? await ctx.db.get('factions', key) : null;
          const data = row && !row.is_deleted ? CanonicalFactionStoredSchema.safeParse(row.data) : null;
          if (!data?.success) {
            throw new ConvexError(`${path}: Choose an available faction.`);
          }
          return data.data;
        })()
      );
    }
    return factions.get(id)!;
  };
  const troop = async (
    selection: { factionId?: string; troopId?: string; face: 'front' | 'back' },
    path: string,
    factionPath: string
  ) => {
    if (!selection.factionId) {
      if (selection.troopId) {
        throw new ConvexError(`${factionPath}: Choose the faction this troop belongs to.`);
      }
      return;
    }
    const data = await faction(selection.factionId, factionPath);
    if (!selection.troopId) {
      return;
    }
    const selected = data.troops.find(({ troopId }) => troopId === selection.troopId);
    if (!selected) {
      throw new ConvexError(`${path}.troopId: This faction troop is unavailable.`);
    }
    if (selection.face === 'back' && !selected.back) {
      throw new ConvexError(`${path}.face: This troop has no back face.`);
    }
  };
  await Promise.all(
    rulebookReferenceUses(contents).map(async (use) => {
      if (use.kind === 'troop') {
        return await troop(use.selection, use.path, use.factionPath);
      }
      const { source, path } = use;
      switch (source.kind) {
        case 'asset':
          return await asset(source.assetId, path, use.assetTypes);
        case 'board':
          if (!resolveRulebookBoardDefinition(source.boardId)) {
            await asset(source.boardId, path, ['board']);
          }
          return;
        case 'stock':
          if (resolveRulebookArtworkSource(source)?.status !== 'ready') {
            throw new ConvexError(`${path}.artworkId: Maintained artwork is unavailable.`);
          }
          return;
        case 'faction-troop':
          return await troop(source, path, `${path}.factionId`);
        case 'faction-member': {
          const data = await faction(source.factionId, `${path}.factionId`);
          if (![data.factionLeader, ...data.leaders].some(({ memberId }) => memberId === source.memberId)) {
            throw new ConvexError(`${path}.memberId: This faction member is unavailable.`);
          }
          return;
        }
        case 'faction':
          await faction(source.factionId, path);
      }
    })
  );
}
