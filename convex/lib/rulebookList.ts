import { v } from 'convex/values';

import type { RulebookSettings } from '../../src/shared/rulebooks/settings';
import { DEFAULT_RULEBOOK_SETTINGS } from '../../src/shared/rulebooks/settings';
import type { Doc, Id } from '../_generated/dataModel';
import schema from '../schema';
import type { QueryCtx } from '../types';
import { rulebookEditionArtifactReadinessValidator, rulebookEditionSummary } from './rulebookEditionArtifacts';
import { rulebookFirstPagePublicationStatus } from './rulebookPublication';
import { rulebookSettingsValidator } from './rulebookSettings';

export const rulebookMetadataValidator = schema.tables.rulebooks.validator.omit('name_key').extend({
  _id: v.id('rulebooks'),
  _creationTime: v.number(),
  settings: rulebookSettingsValidator,
});

const unreservedArtifact = { status: 'preparing' as const, href: null };

export const rulebookListEntryValidator = rulebookMetadataValidator.extend({
  edition_published_at: v.union(v.string(), v.null()),
  html: rulebookEditionArtifactReadinessValidator,
  pdf: rulebookEditionArtifactReadinessValidator,
  first_page_image_url: v.union(v.string(), v.null()),
  first_page_capture_status: v.union(v.literal('scheduled'), v.literal('in_progress'), v.literal('failed'), v.null()),
});

export const rulebookCloneChoiceValidator = rulebookListEntryValidator.extend({
  draft_settings: rulebookSettingsValidator,
});

export function rulebookMetadata(row: Doc<'rulebooks'>, settings: RulebookSettings) {
  const { name_key: _nameKey, ...metadata } = row;
  return { ...metadata, settings };
}

/** The complete saved order under one Ruleset. */
async function rulesetRulebookRows(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  return await ctx.db
    .query('rulebooks')
    .withIndex('by_ruleset_and_is_deleted_and_sort_order', (q) => q.eq('ruleset_id', rulesetId).eq('is_deleted', false))
    .collect();
}

async function publishedRulebookEntry(ctx: QueryCtx, row: Doc<'rulebooks'>) {
  const edition = await ctx.db
    .query('rulebook_editions')
    .withIndex('by_rulebook_and_edition_number', (q) =>
      q.eq('rulebook_id', row._id).eq('edition_number', row.current_edition_number)
    )
    .unique();
  const firstPage = edition
    ? await rulebookFirstPagePublicationStatus(ctx, edition._id)
    : { imageUrl: null, captureStatus: null };
  const artifacts = edition
    ? await rulebookEditionSummary(ctx, edition)
    : { html: unreservedArtifact, pdf: unreservedArtifact };
  return {
    ...rulebookMetadata(row, edition?.settings ?? DEFAULT_RULEBOOK_SETTINGS),
    edition_published_at: edition?.created_at ?? null,
    html: artifacts.html,
    pdf: artifacts.pdf,
    first_page_image_url: firstPage.imageUrl,
    first_page_capture_status: firstPage.captureStatus,
  };
}

/** Public previews use the current immutable Edition, including its legacy settings fallback. */
export async function listRulesetRulebooks(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  return await Promise.all((await rulesetRulebookRows(ctx, rulesetId)).map((row) => publishedRulebookEntry(ctx, row)));
}

/** Only the capability-checked creation response exposes saved draft defaults for cloning. */
export async function listRulesetRulebookCloneChoices(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  return await Promise.all(
    (await rulesetRulebookRows(ctx, rulesetId)).map(async (row) => ({
      ...(await publishedRulebookEntry(ctx, row)),
      draft_settings: row.settings ?? DEFAULT_RULEBOOK_SETTINGS,
    }))
  );
}
