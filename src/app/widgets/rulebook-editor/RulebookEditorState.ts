import type {
  RulebookBlockDraft,
  RulebookContentsDraftV1,
  RulebookContentsV1,
  RulebookPageDraft,
  RulebookRepeatedTextItemDraft,
  RulebookSlotId,
} from '@shared/rulebooks/contents';

import { createRulebookEditorCore } from './rulebookEditorCore';

export type SavedRulebookRevision = {
  readonly revision: string;
  readonly contents: RulebookContentsV1;
};

export type RulebookEntityRef =
  | { readonly kind: 'page'; readonly pageId: string }
  | { readonly kind: 'block'; readonly blockId: string }
  | { readonly kind: 'item'; readonly blockId: string; readonly itemId: string };

export type RulebookOrderedContainerRef =
  | { readonly kind: 'page-order' }
  | {
      readonly kind: 'page-slot';
      readonly pageId: string;
      readonly slotId: RulebookSlotId;
    }
  | { readonly kind: 'item-order'; readonly blockId: string };

export type RulebookPlacement = {
  readonly container: RulebookOrderedContainerRef;
  readonly afterId: string | null;
  readonly beforeId: string | null;
};

export type RulebookNewEntity =
  | { readonly kind: 'page'; readonly page: RulebookPageDraft }
  | { readonly kind: 'block'; readonly block: RulebookBlockDraft }
  | {
      readonly kind: 'item';
      readonly blockId: string;
      readonly item: RulebookRepeatedTextItemDraft;
    };

export type RulebookDraftSubtree =
  | {
      readonly kind: 'page';
      readonly page: RulebookPageDraft;
      readonly blocksById: Readonly<Record<string, RulebookBlockDraft>>;
    }
  | { readonly kind: 'block'; readonly block: RulebookBlockDraft }
  | {
      readonly kind: 'item';
      readonly blockId: string;
      readonly item: RulebookRepeatedTextItemDraft;
    };

export type RulebookCreateIntent = {
  readonly kind: 'create';
  readonly entity: RulebookNewEntity;
  readonly placement: RulebookPlacement;
};

export type RulebookDeleteIntent = {
  readonly kind: 'delete';
  readonly root: RulebookEntityRef;
  readonly deletedRefs: readonly RulebookEntityRef[];
};

export type RulebookSetIntent =
  | {
      readonly kind: 'set';
      readonly target: Extract<RulebookEntityRef, { kind: 'page' }>;
      readonly field: 'anchor';
      readonly value: string;
    }
  | {
      readonly kind: 'set';
      readonly target: Extract<RulebookEntityRef, { kind: 'block' }>;
      readonly field: 'anchor';
      readonly value?: string;
    }
  | {
      readonly kind: 'set';
      readonly target: Extract<RulebookEntityRef, { kind: 'block' }>;
      readonly field: 'text';
      readonly value: string;
    }
  | {
      readonly kind: 'set';
      readonly target: Extract<RulebookEntityRef, { kind: 'item' }>;
      readonly field: 'text';
      readonly value: string;
    };

export type RulebookPlaceIntent = {
  readonly kind: 'place';
  readonly target: RulebookEntityRef;
  readonly original: RulebookPlacement;
  readonly destination: RulebookPlacement;
};

export type RulebookRestoreIntent = {
  readonly kind: 'restore';
  readonly root: RulebookEntityRef;
  readonly snapshot: RulebookDraftSubtree;
  readonly placement: RulebookPlacement;
};

export type RulebookEditPatchV1 = {
  readonly schemaVersion: 1;
  readonly baselineRevision: string;
  readonly creates: readonly RulebookCreateIntent[];
  readonly deletes: readonly RulebookDeleteIntent[];
  readonly sets: readonly RulebookSetIntent[];
  readonly placements: readonly RulebookPlaceIntent[];
  readonly restorations: readonly RulebookRestoreIntent[];
};

export type RulebookFieldDiagnostic = {
  readonly target?: RulebookEntityRef;
  readonly field?: 'anchor' | 'text' | 'structure';
  readonly code: string;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
  readonly offset?: number;
};

type RulebookIncompatibilityBase = {
  readonly id: string;
  readonly dependencyFingerprint: string;
};

export type RulebookFieldIncompatibility = RulebookIncompatibilityBase & {
  readonly kind: 'field';
  readonly target: RulebookEntityRef;
  readonly field: 'anchor' | 'text';
  readonly baselineValue?: string;
  readonly latestValue?: string;
  readonly localValue?: string;
  readonly combinedText?: string;
};

export type RulebookAnchorIncompatibility = RulebookIncompatibilityBase & {
  readonly kind: 'anchor';
  readonly target: RulebookEntityRef;
  readonly value: string;
  readonly collidesWith: RulebookEntityRef;
  readonly suggestedValue: string;
};

export type RulebookPlacementIncompatibility = RulebookIncompatibilityBase & {
  readonly kind: 'placement';
  readonly target: RulebookEntityRef;
  readonly baseline?: RulebookPlacement;
  readonly latest?: RulebookPlacement;
  readonly local: RulebookPlacement;
  readonly reason: 'competing-move' | 'missing-neighbor' | 'cross-container-neighbor';
};

export type RulebookOrderingIncompatibility = RulebookIncompatibilityBase & {
  readonly kind: 'collection-order';
  readonly container: RulebookOrderedContainerRef;
  readonly latestOrder: readonly string[];
  readonly localOrder: readonly string[];
};

type RulebookDeletionIncompatibility = RulebookIncompatibilityBase & {
  readonly kind: 'deletion';
  readonly direction: 'saved-deletion' | 'local-deletion';
  readonly root: RulebookEntityRef;
  readonly affectedRefs: readonly RulebookEntityRef[];
  readonly localSnapshot?: RulebookDraftSubtree;
  readonly localPlacement?: RulebookPlacement;
};

export type RulebookIncompatibility =
  | RulebookFieldIncompatibility
  | RulebookAnchorIncompatibility
  | RulebookPlacementIncompatibility
  | RulebookOrderingIncompatibility
  | RulebookDeletionIncompatibility;

type RulebookResolutionOutcome =
  | { readonly kind: 'field'; readonly value?: string }
  | { readonly kind: 'placement'; readonly destination: RulebookPlacement }
  | {
      readonly kind: 'collection-order';
      readonly container: RulebookOrderedContainerRef;
      readonly orderedIds: readonly string[];
    }
  | { readonly kind: 'accept-saved-deletion' }
  | { readonly kind: 'restore-local-subtree' }
  | { readonly kind: 'keep-local-deletion' }
  | { readonly kind: 'accept-latest-subtree' };

export type RulebookResolutionApproval = {
  readonly incompatibilityId: string;
  readonly dependencyFingerprint: string;
  readonly outcome: RulebookResolutionOutcome;
};

export type RulebookEditorInput = {
  readonly baseline: SavedRulebookRevision;
  readonly latest: SavedRulebookRevision;
  readonly patch: RulebookEditPatchV1;
  readonly resolutionLedger: readonly RulebookResolutionApproval[];
};

export type RulebookEditorReadyResult = {
  readonly status: 'ready';
  readonly draft: RulebookContentsDraftV1;
  readonly comparisonDraft: RulebookContentsDraftV1;
  readonly latest: SavedRulebookRevision;
  readonly diagnostics: readonly RulebookFieldDiagnostic[];
  readonly saveCandidate?: RulebookContentsV1;
  readonly incompatibilities: readonly RulebookIncompatibility[];
  readonly resolutionLedger: readonly RulebookResolutionApproval[];
  readonly rebasedPatch: RulebookEditPatchV1;
  readonly canSave: boolean;
  readonly isSaving: boolean;
  readonly saveRequest?: {
    readonly expectedRevision: string;
    readonly contents: RulebookContentsV1;
  };
  readonly operationError?: string;
};

type RulebookEditorUnsupportedResult = {
  readonly status: 'unsupported';
  readonly received: unknown;
  readonly message: string;
  readonly canSave: false;
  readonly isSaving: false;
};

export type RulebookEditorResult = RulebookEditorReadyResult | RulebookEditorUnsupportedResult;

export type RulebookEditorAction =
  | RulebookCreateIntent
  | Omit<RulebookDeleteIntent, 'deletedRefs'>
  | RulebookSetIntent
  | Omit<RulebookPlaceIntent, 'original'>
  | { readonly kind: 'replace-draft'; readonly draft: RulebookContentsDraftV1 }
  | { readonly kind: 'receive-latest'; readonly latest: SavedRulebookRevision }
  | { readonly kind: 'resolve'; readonly approval: RulebookResolutionApproval }
  | { readonly kind: 'begin-save' }
  | { readonly kind: 'save-succeeded'; readonly saved: SavedRulebookRevision }
  | { readonly kind: 'save-stale'; readonly latest: SavedRulebookRevision };

export type RulebookEditorStateManager = {
  readonly result: RulebookEditorResult;
  dispatch(action: RulebookEditorAction): RulebookEditorResult;
};

/**
 * The browser editor membrane.
 * Callers provide saved state and current intent, then dispatch semantic editor or save-lifecycle actions;
 * reconciliation, patch compaction, approvals, and eligibility stay inside.
 */
export function createRulebookEditorStateManager(input: RulebookEditorInput): RulebookEditorStateManager {
  return createRulebookEditorCore(input);
}
