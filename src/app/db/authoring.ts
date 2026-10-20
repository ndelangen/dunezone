import {
  customCardTokenIds,
  customCardPublicationError,
  spiceCardTokenIds,
  spiceCardPublicationError,
} from '@shared/assets/cardReferences';
import { parseRawAsset, parseRawFaction, rawRulebookSchema, readRawAuthoringJson } from '@shared/authoring/raw';
import type { RulebookContentsDraftV1 } from '@shared/rulebooks/contents';
import { rulebookDraftCompatibilityError, rulebookCoverImagesError } from '@shared/rulebooks/draftCompatibility';
import { assertRulebookReferences, collectRulebookReferenceIds } from '@shared/rulebooks/references';
import type { RulebookSettings } from '@shared/rulebooks/settings';

import { db } from '@db/core';
import { useSessionViewer } from '@db/profiles';

import { api } from '../../../convex/_generated/api';

/** Resolves only the pasted Asset's selected links through the same reads as its editor. */
export async function prepareRawAsset(args: { type: string; targetId?: string; text: string }) {
  const parsed = parseRawAsset(args.type, readRawAuthoringJson(args.text));
  const data = parsed.data as Record<string, unknown>;
  const back = (args.type === 'deck' ? data.cardback : args.type.startsWith('token-') ? data.back : undefined) as
    | { mode?: string; asset_id?: string }
    | undefined;
  const referencedBack =
    back?.mode === 'reference' && back.asset_id
      ? await db.query(
          api.assets.linkedBack,
          {
            type: args.type,
            targetId: args.targetId,
            referenceId: back.asset_id,
          },
          { hold: false }
        )
      : undefined;
  const board = data.board as { asset_id: string } | undefined;
  if (args.type === 'card-spice' && board) {
    const resolved = await db.query(
      api.assets.spiceCardBoard,
      {
        boardId: board.asset_id,
        tokenIds: spiceCardTokenIds(data),
      },
      { hold: false }
    );
    const error = spiceCardPublicationError(data, resolved);
    if (error) {
      throw new Error(error);
    }
    if (!resolved.board) {
      throw new Error('$.board.asset_id: Choose an available, renderable board.');
    }
    if (Object.values(resolved.tokens).some((token) => token === null)) {
      throw new Error('$.board.tokens: A token is unavailable.');
    }
  }
  if (args.type === 'card-custom' || args.type === 'card-storm') {
    const ids = customCardTokenIds(data);
    const resolved = ids.length
      ? await db.query(api.assets.customCardTokens, { ids }, { hold: false })
      : { tokens: {}, error: null };
    const error = customCardPublicationError(data, resolved);
    if (error) {
      throw new Error(error);
    }
    if (Object.values(resolved.tokens).some((token) => token === null)) {
      throw new Error('$.layers: A linked token is unavailable.');
    }
  }
  const linkedFaction = data.factionLink as { id: string; slug: string } | undefined;
  if (linkedFaction) {
    const slug = await db.query(api.factions.pageSlug, { id: linkedFaction.id }, { hold: false });
    if (!slug) {
      throw new Error('$.factionLink: Choose an available faction.');
    }
    if (slug !== linkedFaction.slug) {
      throw new Error('$.factionLink.slug: The faction address does not match its ID.');
    }
  }
  return { ...parsed, ...(referencedBack ? { referencedBack } : {}) };
}

export async function prepareRawFaction(text: string) {
  const draft = parseRawFaction(readRawAuthoringJson(text));
  const resolved = new Map<string, boolean>();
  for (const [index, extra] of (draft.extras ?? []).entries()) {
    const key = `${extra.type}/${extra.slug}`;
    if (!resolved.has(key)) {
      resolved.set(key, !!(await db.query(api.assets.page, { type: extra.type, slug: extra.slug }, { hold: false })));
    }
    if (!resolved.get(key)) {
      throw new Error(`$.extras.${index}: The ${key} asset is unavailable.`);
    }
  }
  return draft;
}

/** The route supplies its current pair; selected IDs ride the editor's existing reference read. */
export async function prepareRawRulebook(
  text: string,
  target: {
    rulesetSlug: string;
    rulebookSlug: string;
    current: { contents: RulebookContentsDraftV1; settings: RulebookSettings };
  }
) {
  const draft = rawRulebookSchema.parse(readRawAuthoringJson(text));
  const currentError = rulebookDraftCompatibilityError(
    target.current.contents,
    draft.contents,
    draft.settings,
    target.current.settings
  );
  if (currentError) {
    throw new Error(currentError);
  }
  const references = collectRulebookReferenceIds(draft.contents);
  const page = await db.query(
    api.rulebooks.editorPage,
    {
      ruleset_slug: target.rulesetSlug,
      rulebook_slug: target.rulebookSlug,
      reference_asset_ids: references.assetIds,
      reference_faction_ids: references.factionIds,
      faction_token_images: false,
    },
    { hold: false }
  );
  if (!page) {
    throw new Error('Choose an available destination Rulebook.');
  }
  if (page.kind !== 'editable') {
    throw new Error('Not authorized to edit this Rulebook.');
  }
  const savedError =
    rulebookDraftCompatibilityError(page.draft.contents, draft.contents, draft.settings, page.draft.settings) ??
    rulebookCoverImagesError(draft.contents, page.coverImageOrigins);
  if (savedError) {
    throw new Error(savedError);
  }
  assertRulebookReferences(draft.contents, page.assetsById, page.factionsById);
  return draft;
}

/** The owning route passes account changes into its open Load session. */
export function useAuthoringAccountKey() {
  const viewer = useSessionViewer();
  return viewer.kind === 'profile' ? viewer.profile._id : viewer.kind;
}
