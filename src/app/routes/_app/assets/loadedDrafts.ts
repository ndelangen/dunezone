import { RectangleTokenAsset, TokenAsset } from '@shared/assets/schema';
import type { AssetType } from '@shared/assets/types';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import type { z } from 'zod';

import { assetLoad } from '@app/pickers/assetLoadSource';
import type { EditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import type { DeckDraft } from '@app/widgets/deck-editor/DeckEditor';
import type { RectangleDraft } from '@app/widgets/token-editor/RectangleTokenEditor';
import type { TokenDraft } from '@app/widgets/token-editor/TokenEditor';
import { DeckAsset } from '@game/data/objects';

/*
 * Stored Asset data as the editors' drafts hold it, for loading one Asset into another's draft.
 * Shared by the create and edit pages of each type, which load through the same `assetLoadSource`.
 */

/* The token drafts model a reference with no target as an explicit null, which the stored optional cannot say. */
export const LoadedTokenDraft = TokenAsset.transform((token): TokenDraft => ({
  ...token,
  back: token.back.mode === 'reference' ? { mode: 'reference', asset_id: token.back.asset_id ?? null } : token.back,
}));

export const LoadedRectangleDraft = RectangleTokenAsset.transform((token): RectangleDraft => ({
  ...token,
  back: token.back.mode === 'reference' ? { mode: 'reference', asset_id: token.back.asset_id ?? null } : token.back,
}));

/* The transitional bare cardback re-tags as custom, the same flattening the deck edit page does at its parse boundary. */
export const LoadedDeckDraft = DeckAsset.transform((deck): DeckDraft => ({
  ...deck,
  cardback:
    'mode' in deck.cardback && deck.cardback.mode !== 'custom' ? deck.cardback : { ...deck.cardback, mode: 'custom' },
}));

/**
 * The toolbar's `load` for a token page, create or edit alike: another token of the same type, with the back it wears.
 * The loaded draft replaces the page's draft through `header.releasing`, as every wholesale replacement does.
 */
export function tokenLoad<Data extends { name: string }>({
  type,
  schema,
  editing,
  saveState,
  header,
  dispatch,
}: {
  type: AssetType;
  schema: z.ZodType<Data>;
  editing?: { id: string; name: string };
  saveState: AuthoringSaveState;
  header: Pick<EditPageHeader, 'releasing'>;
  dispatch: (action: { kind: 'replace'; data: Data; pick: { name: string; data: unknown } | null }) => void;
}) {
  return assetLoad({
    noun: 'token',
    type,
    schema,
    editing,
    disabled: saveState === 'saving',
    onLoaded: header.releasing((loaded) =>
      dispatch({ kind: 'replace', data: loaded.data, pick: loaded.source?.backToken ?? null })
    ),
  });
}
