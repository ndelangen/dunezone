import { useMutation, usePaginatedQuery, useQueries, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useLiveOperation } from './core/live';

/** A Faction as the merge page reads it: its variants, the deleted ones too, each with its parent and its slug. */
export type MergeFaction = NonNullable<FunctionReturnType<typeof api.factionMerge.variants>>;
export type MergeVariant = MergeFaction['variants'][number];
/** What one variant's merge or move would do. */
export type MergePreview = FunctionReturnType<typeof api.factionMerge.preview>;
/** A preview as the page holds it: the answer, the server's refusal, or nothing yet. */
export type MergePreviewAnswer = MergePreview | Error | undefined;

/** Where one variant, with its branch, would go: the Faction it joins, the parent it follows there and the name it takes. */
export type MergePlacement = Readonly<{
  factionId: string;
  familyId: string;
  parentId: string | null;
  name: string;
}>;

/** What a run placed: the Faction the variants went into, and each variant under the address it now has. */
export type MergedVariants = Readonly<{ into: string; variants: readonly { name: string; slug: string }[] }>;

function placeArgs(placement: MergePlacement) {
  return {
    faction_id: placement.factionId as Id<'factions'>,
    family_id: placement.familyId as Id<'faction_families'>,
    parent_id: placement.parentId as Id<'factions'> | null,
  };
}

/**
 * The Faction the variant `factionId` belongs to, for the admin merge page;
 * null asks for nothing.
 * Admin only: mount it behind the admin gate.
 * Undefined while loading or when nothing was asked, and null when the variant or its Faction is gone.
 */
export function useMergeFaction(factionId: string | null) {
  return useQuery(api.factionMerge.variants, factionId ? { faction_id: factionId as Id<'factions'> } : 'skip');
}

/**
 * The preview of each placement, by the variant it places.
 * A placement the server refuses, such as a parent from the variant's own branch, answers with the refusal instead of throwing, so the page can show it beside the field.
 * The name is not sent, so typing one asks nothing;
 * the page checks it against the slugs the Faction lists.
 */
export function useMergePreviews(placements: readonly MergePlacement[]) {
  const serialized = JSON.stringify(placements.map(placeArgs));
  /* Convex tracks the request object by identity, so the map changes only when a placement does. */
  const queries = useMemo(
    () =>
      Object.fromEntries(
        (JSON.parse(serialized) as ReturnType<typeof placeArgs>[]).map((args) => [
          args.faction_id,
          { query: api.factionMerge.preview, args },
        ])
      ),
    [serialized]
  );
  return useQueries(queries) as Record<string, MergePreviewAnswer>;
}

const REFERENCE_PAGE = 10;

/** Every saved Rulebook draft, or every Edition, a placement rewrites references in; it keeps asking until the server has read them all. */
function useReferencePages(placement: MergePlacement, documents: 'drafts' | 'editions') {
  const { results, status, loadMore } = usePaginatedQuery(
    api.factionMerge.referencePreview,
    { ...placeArgs(placement), documents },
    { initialNumItems: REFERENCE_PAGE }
  );
  /* The server reads the documents a page at a time and a page may hold none. */
  useEffect(() => {
    if (status === 'CanLoadMore') {
      loadMore(REFERENCE_PAGE);
    }
  }, [status, loadMore]);
  return { rows: results, isDone: status === 'Exhausted' };
}

/**
 * Every saved Rulebook draft and every Edition in which a placement rewrites references, with how many;
 * `isDone` says when all are read.
 * It reads every document, so mount it only once the reader asks for the list.
 * The name does not change what is rewritten, so it is left out and typing one does not start the read again.
 */
export function useMergeReferences(placement: MergePlacement) {
  const drafts = useReferencePages(placement, 'drafts');
  const editions = useReferencePages(placement, 'editions');
  return { rows: [...drafts.rows, ...editions.rows], isDone: drafts.isDone && editions.isDone };
}

type MergeRun = Readonly<{ placements: readonly MergePlacement[]; into: string }>;
type MergeProgress = Readonly<{ merged: MergedVariants | null; stoppedAt: string | null }>;
const NO_PROGRESS: MergeProgress = { merged: null, stoppedAt: null };

/**
 * Merges variants into a Faction, or moves one under another parent of its own, one placement after the other.
 * Each placement is a transaction of its own, so the first refusal stops the rest and leaves what went before in place:
 * `merged` then holds what was placed, and `stoppedAt` the variant the run stopped at, which is still in the Faction it came from.
 * A second `merge` while one runs does nothing.
 */
export function useMergeVariants() {
  const attach = useMutation(api.factionMerge.attach);
  const [progress, setProgress] = useState(NO_PROGRESS);
  const running = useRef(false);
  const operation = useCallback(
    async ({ placements, into }: MergeRun) => {
      const variants: { name: string; slug: string }[] = [];
      const placed = () => (variants.length > 0 ? { into, variants } : null);
      setProgress((before) => ({ ...before, merged: null }));
      for (const placement of placements) {
        try {
          const { slug } = await attach({ ...placeArgs(placement), name: placement.name });
          variants.push({ name: placement.name.trim(), slug });
        } catch (error) {
          setProgress({ merged: placed(), stoppedAt: placement.factionId });
          throw error;
        }
      }
      setProgress({ merged: placed(), stoppedAt: null });
    },
    [attach]
  );
  const { mutate, isPending, error, reset: resetOperation } = useLiveOperation(operation);
  const merge = (run: MergeRun, options: { onSuccess: () => void; onError: () => void }) => {
    if (running.current) {
      return;
    }
    running.current = true;
    mutate(run, {
      ...options,
      onSettled: () => {
        running.current = false;
      },
    });
  };
  const reset = () => {
    resetOperation();
    setProgress(NO_PROGRESS);
  };
  return { merge, isPending, error, ...progress, reset };
}
