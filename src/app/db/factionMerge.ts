import { useMutation, usePaginatedQuery, useQueries, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useEffect, useMemo, useState } from 'react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

/** A Faction as the merge page reads it: its variants, the deleted ones too, each with its parent. */
export type MergeFaction = NonNullable<FunctionReturnType<typeof api.factionMerge.variants>>;
export type MergeVariant = MergeFaction['variants'][number];
/** What one variant's merge or move would do. */
export type MergePreview = FunctionReturnType<typeof api.factionMerge.preview>;

/** Where one variant, with its branch, would go: the Faction it joins, the parent it follows there and the name it takes. */
export type MergePlacement = Readonly<{
  factionId: string;
  familyId: string;
  parentId: string | null;
  name: string;
}>;

function attachArgs(placement: MergePlacement) {
  return {
    faction_id: placement.factionId as Id<'factions'>,
    family_id: placement.familyId as Id<'faction_families'>,
    parent_id: placement.parentId as Id<'factions'> | null,
    name: placement.name,
  };
}

/**
 * The Faction the variant `factionId` belongs to, for the admin merge page.
 * Admin only: mount it behind the admin gate.
 * Undefined while loading, and null when the variant or its Faction is gone.
 */
export function useMergeFaction(factionId: string) {
  return useQuery(api.factionMerge.variants, { faction_id: factionId as Id<'factions'> });
}

function sameAnswer(a: MergePreview | Error | undefined, b: MergePreview | Error | undefined) {
  return a === b || (a instanceof Error && b instanceof Error && a.message === b.message);
}

/**
 * The preview of each placement, by the variant it places.
 * A placement the server refuses, such as a parent from the variant's own branch, answers with the refusal instead of throwing, so the page can show it beside the field.
 * A name or parent changes the arguments as the admin edits, so the last answer for a variant stays until the next arrives;
 * `isSettled` is false while any shown answer is such a held one.
 */
export function useMergePreviews(placements: readonly MergePlacement[]) {
  const serialized = JSON.stringify(placements);
  const queries = useMemo(
    () =>
      Object.fromEntries(
        (JSON.parse(serialized) as MergePlacement[]).map((placement) => [
          placement.factionId,
          { query: api.factionMerge.preview, args: attachArgs(placement) },
        ])
      ),
    [serialized]
  );
  const live = useQueries(queries) as Record<string, MergePreview | Error | undefined>;
  const [held, setHeld] = useState<Record<string, MergePreview | Error>>({});
  const answered = Object.entries(live).filter(
    (entry): entry is [string, MergePreview | Error] => entry[1] !== undefined
  );
  if (answered.some(([key, answer]) => !sameAnswer(held[key], answer))) {
    setHeld({ ...held, ...Object.fromEntries(answered) });
  }
  const previews: Record<string, MergePreview | Error | undefined> = Object.fromEntries(
    placements.map(({ factionId }) => [factionId, live[factionId] ?? held[factionId]])
  );
  return { previews, isSettled: placements.every(({ factionId }) => live[factionId] !== undefined) };
}

const REFERENCE_PAGE = 10;

/**
 * Every saved Rulebook draft, or every Edition, in which a placement rewrites references, with how many.
 * The server reads the documents a page at a time and a page may hold none, so this keeps asking until it has read them all;
 * `isDone` says when.
 * The name does not change what is rewritten, so it is left out and typing one does not start the read again.
 */
export function useMergeReferences(placement: MergePlacement, documents: 'drafts' | 'editions') {
  const { name: _name, ...args } = attachArgs(placement);
  const { results, status, loadMore } = usePaginatedQuery(
    api.factionMerge.referencePreview,
    { ...args, documents },
    { initialNumItems: REFERENCE_PAGE }
  );
  useEffect(() => {
    if (status === 'CanLoadMore') {
      loadMore(REFERENCE_PAGE);
    }
  }, [status, loadMore]);
  return { rows: results, isDone: status === 'Exhausted' };
}

/** Merges one variant, with its branch, into a Faction, or moves it under another parent of its own; answers with the address it then lives at. */
export function useAttachFactionVariant() {
  const attach = useMutation(api.factionMerge.attach);
  return (placement: MergePlacement) => attach(attachArgs(placement));
}
