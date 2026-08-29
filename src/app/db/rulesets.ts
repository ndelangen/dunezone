import type { RulesetAssetSlot } from '@shared/rulesets/assetSlots';
import { rulesetCoverThumbUrl } from '@shared/rulesets/cover';
import { rulesetInputSchema } from '@shared/rulesets/validation';
import type { RulesetInput } from '@shared/rulesets/validation';
import { useAction, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { ConvexError } from 'convex/values';

import { db } from '@db/core';
import { factionCatalogueRowsToEntries } from '@db/factions';
import type { FactionCatalogueEntry } from '@db/factions';
import type { FaqAnswerEntry, FaqItemWithDetails } from '@db/faq';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import type { AssignedGroupSummary, CollaborativeAccess } from '../../../convex/lib/collaborativeAccess';
import type { ProfileSummary } from '../../../convex/lib/collaborativeAccessValidators';

/** What a caller authors, derived from the schema that validates it. Both fields are required, and About sits above its floor. */
export type Ruleset = RulesetInput;
export type RulesetRow = Doc<'rulesets'>;
export type RulesetEntry = Omit<RulesetRow, 'name' | 'about'> & {
  name: Ruleset['name'];
  about: Ruleset['about'];
  id: RulesetRow['_id'];
  /**
   * The one URL a page renders for the cover: the stored cover when it exists, the legacy hot-link until the backfill converts it.
   * Derived here so the legacy fallback lives in one place and the retirement release deletes it here alone.
   */
  coverUrl: string | null;
  /** The thumb rendition for grids and chips, falling back like `coverUrl` where only a legacy or full URL exists. */
  coverThumbUrl: string | null;
};
export type RulesetPageData = {
  ruleset: RulesetEntry;
  /** Catalogue-shaped, so the page renders its factions with the same vocabulary the catalogue uses. */
  factions: FactionCatalogueEntry[];
  viewerAccess: Extract<CollaborativeAccess, { kind: 'ruleset' }>;
};

/** One asset a ruleset has slotted: enough to name it and link to it, since a slot list is not a catalogue. */
type RulesetSlottedAsset = { slot: string; asset: { id: string; type: string; slug: string; name: string } };

export type RulesetDetailPageData = RulesetPageData & {
  owner: ProfileSummary | null;
  assignableGroups: AssignedGroupSummary[];
  faqItems: FaqItemWithDetails[];
  assetSlots: RulesetSlottedAsset[];
};

function toRulesetPageData(raw: FunctionReturnType<typeof api.rulesets.getBySlug>): RulesetPageData {
  return {
    ruleset: toRulesetEntry(raw.ruleset),
    factions: factionCatalogueRowsToEntries(raw.factions),
    viewerAccess: raw.viewerAccess,
  };
}

/** Canonical detail page model, shared by the route loader and the live subscription. */
function normalizeRulesetDetailPage(
  raw: NonNullable<FunctionReturnType<typeof api.rulesets.detailPageBySlug>>
): RulesetDetailPageData {
  return {
    ruleset: toRulesetEntry(raw.ruleset),
    factions: factionCatalogueRowsToEntries(raw.factions),
    viewerAccess: raw.viewerAccess,
    owner: raw.owner,
    assignableGroups: raw.assignableGroups,
    faqItems: mapFaqItemsFromConvex(raw.faqItems),
    assetSlots: raw.assetSlots,
  };
}

type FaqItemConvexRow = Omit<FaqItemWithDetails, 'id' | 'faq_answers'> & {
  faq_answers: Omit<FaqAnswerEntry, 'id'>[];
};

function mapFaqItemsFromConvex(items: FaqItemConvexRow[]): FaqItemWithDetails[] {
  return items.map((item) => ({
    ...item,
    id: item._id,
    faq_answers: item.faq_answers.map((answer) => ({ ...answer, id: answer._id })),
  }));
}

function toRulesetEntry(entry: RulesetRow): RulesetEntry {
  return {
    ...entry,
    id: entry._id,
    name: entry.name,
    about: entry.about,
    coverUrl: entry.cover?.url ?? entry.image_cover,
    coverThumbUrl: rulesetCoverThumbUrl(entry),
  };
}

export function rulesetRowsToEntries(entries: RulesetRow[]): RulesetEntry[] {
  return entries.map(toRulesetEntry);
}

export async function loadRulesetsAll(): Promise<RulesetEntry[]> {
  const entries = await db.query(api.rulesets.list, {});
  return rulesetRowsToEntries(entries);
}

export async function loadRulesetBySlug(slug: string): Promise<RulesetPageData> {
  const result = await db.query(api.rulesets.getBySlug, { slug });
  return toRulesetPageData(result);
}

export async function loadRulesetDetailPage(slug: string): Promise<RulesetDetailPageData | null> {
  const raw = await db.query(api.rulesets.detailPageBySlug, { slug });
  return raw ? normalizeRulesetDetailPage(raw) : null;
}

export function useRulesetsAll(options?: { initialData?: RulesetEntry[] }) {
  const liveData = useQuery(api.rulesets.list, {});
  const normalized = liveData?.map(toRulesetEntry);
  return toLiveQueryResult(normalized, () => options?.initialData ?? undefined);
}

export function useRulesetBySlug(slug: string, options?: { initialData?: RulesetPageData }) {
  const liveData = useQuery(api.rulesets.getBySlug, { slug });
  const normalized = liveData ? toRulesetPageData(liveData) : undefined;
  const result = toLiveQueryResult(normalized, () => options?.initialData);
  return result;
}

export function useRulesetDetailPage(slug: string, options?: { initialData?: RulesetDetailPageData }) {
  const liveData = useQuery(api.rulesets.detailPageBySlug, {
    slug,
  });
  const normalized: RulesetDetailPageData | null | undefined =
    liveData === undefined ? undefined : liveData === null ? null : normalizeRulesetDetailPage(liveData);
  const result = toLiveQueryResult(normalized, () => options?.initialData);
  return result;
}

export function useCreateRuleset() {
  type CreatedRulesetResult = FunctionReturnType<typeof api.rulesets.create>;
  const toCreatedRulesetEntry = (entry: CreatedRulesetResult) => {
    const { route_notice, ...row } = entry;
    return { ...toRulesetEntry(row), route_notice };
  };
  const mutation = useLiveMutation<
    { name: string; about: string; group_id?: string | null; image_cover: string | null },
    CreatedRulesetResult
  >(api.rulesets.create);
  return {
    ...mutation,
    mutate: (
      variables: { input: Ruleset; groupId?: string | null; imageCover?: string | null },
      options?: {
        onSuccess?: (entry: ReturnType<typeof toCreatedRulesetEntry>) => void;
        onError?: (error: Error) => void;
      }
    ) =>
      mutation.mutate(
        {
          ...rulesetInputSchema.parse(variables.input),
          ...(variables.groupId === undefined ? {} : { group_id: variables.groupId }),
          image_cover: variables.imageCover ?? null,
        },
        {
          onSuccess: (entry) => options?.onSuccess?.(toCreatedRulesetEntry(entry)),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({
      input,
      groupId,
      imageCover,
    }: {
      input: Ruleset;
      groupId?: string | null;
      imageCover?: string | null;
    }) => {
      const validated = rulesetInputSchema.parse(input);
      const entry = await mutation.mutateAsync({
        ...validated,
        ...(groupId === undefined ? {} : { group_id: groupId }),
        image_cover: imageCover ?? null,
      });
      return toCreatedRulesetEntry(entry);
    },
  };
}

export function useUpdateRuleset() {
  const mutation = useLiveMutation<
    { id: string; name: string; about: string; image_cover?: string | null },
    RulesetRow
  >(api.rulesets.update);
  return {
    ...mutation,
    mutate: (
      variables: {
        input: Ruleset;
        id: string;
        imageCover?: string | null;
      },
      options?: {
        onSuccess?: (entry: RulesetEntry) => void;
        onError?: (error: Error) => void;
      }
    ) =>
      mutation.mutate(
        {
          id: variables.id,
          ...rulesetInputSchema.parse(variables.input),
          image_cover: variables.imageCover,
        },
        {
          onSuccess: (entry) => options?.onSuccess?.(toRulesetEntry(entry)),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ input, id, imageCover }: { input: Ruleset; id: string; imageCover?: string | null }) => {
      const validated = rulesetInputSchema.parse(input);
      const entry = await mutation.mutateAsync({
        id,
        ...validated,
        image_cover: imageCover,
      });
      return toRulesetEntry(entry);
    },
  };
}

/**
 * Rehosts a pasted cover URL: the Worker fetches it once, re-encodes it and stores it, and the ruleset ends up carrying our delivery URL.
 * The document updates through the live subscription, so callers only need the promise to settle or throw the author-facing refusal.
 */
export function useRehostRulesetCover() {
  const rehost = useAction(api.rulesetCovers.rehost);
  return async ({ id, sourceUrl }: { id: RulesetRow['_id']; sourceUrl: string }) => {
    try {
      await rehost({ id, source_url: sourceUrl });
    } catch (error) {
      /* The action's refusals travel as ConvexError data; anything else is redacted server-side, so the caller gets the plain fallback. */
      throw new Error(error instanceof ConvexError ? String(error.data) : 'The cover could not be stored');
    }
  };
}

/** Moves a ruleset between maintaining groups, or clears the assignment with `null`. The peer of `useSetFactionGroup`. */
export function useSetRulesetGroup() {
  const mutation = useLiveMutation<{ id: string; group_id: string | null }, RulesetRow>(api.rulesets.setGroup);
  return {
    ...mutation,
    mutate: (
      variables: { id: string; groupId: string | null },
      options?: { onSuccess?: (entry: RulesetEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        { id: variables.id, group_id: variables.groupId },
        {
          onSuccess: (entry) => options?.onSuccess?.(toRulesetEntry(entry)),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ id, groupId }: { id: string; groupId: string | null }) => {
      const entry = await mutation.mutateAsync({ id, group_id: groupId });
      return toRulesetEntry(entry);
    },
  };
}

type RulesetFactionLink = { rulesetId: string; factionId: string };

/**
 * The two link mutations differ only in which function they call, so they share one wrapper.
 * It exists to keep callers in this module's camelCase vocabulary;
 * every other hook here maps to the Convex snake_case at this boundary rather than leaking it into the routes.
 */
function useRulesetFactionLinkMutation(reference: typeof api.rulesets.addFaction) {
  const mutation = useLiveMutation<{ ruleset_id: string; faction_id: string }, unknown>(reference);
  const toArgs = ({ rulesetId, factionId }: RulesetFactionLink) => ({
    ruleset_id: rulesetId,
    faction_id: factionId,
  });
  return {
    ...mutation,
    mutate: (variables: RulesetFactionLink, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) =>
      mutation.mutate(toArgs(variables), { onSuccess: () => options?.onSuccess?.(), onError: options?.onError }),
    mutateAsync: async (variables: RulesetFactionLink) => await mutation.mutateAsync(toArgs(variables)),
  };
}

type RulesetAssetSlotLink = { rulesetId: string; assetId: string; slot: RulesetAssetSlot };

/**
 * Both slot mutations take the same three arguments and differ only in which function they call, so they share one wrapper the way the faction links do.
 * The snake_case boundary stops here rather than leaking into the routes.
 */
function useRulesetAssetSlotMutation(reference: typeof api.rulesets.setAssetSlot) {
  const mutation = useLiveMutation<{ ruleset_id: string; asset_id: string; slot: string }, unknown>(reference);
  const toArgs = ({ rulesetId, assetId, slot }: RulesetAssetSlotLink) => ({
    ruleset_id: rulesetId,
    asset_id: assetId,
    slot,
  });
  return {
    ...mutation,
    mutate: (variables: RulesetAssetSlotLink, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) =>
      mutation.mutate(toArgs(variables), { onSuccess: () => options?.onSuccess?.(), onError: options?.onError }),
    mutateAsync: async (variables: RulesetAssetSlotLink) => await mutation.mutateAsync(toArgs(variables)),
  };
}

export function useSetRulesetAssetSlot() {
  return useRulesetAssetSlotMutation(api.rulesets.setAssetSlot);
}

export function useClearRulesetAssetSlot() {
  return useRulesetAssetSlotMutation(api.rulesets.clearAssetSlot);
}

/**
 * Links a faction to a ruleset, and unlinks it.
 * Both are gated server-side on the ruleset's `edit` capability, held by its owner and by active members of its maintaining group, so the page shows the affordances on the same condition.
 */
export function useAddRulesetFaction() {
  return useRulesetFactionLinkMutation(api.rulesets.addFaction);
}

export function useRemoveRulesetFaction() {
  return useRulesetFactionLinkMutation(api.rulesets.removeFaction);
}

export function useDeleteRuleset() {
  const mutation = useLiveMutation<{ id: string }, void>(api.rulesets.softDelete);
  return {
    ...mutation,
    mutate: (id: string, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) =>
      mutation.mutate(
        { id },
        {
          onSuccess: () => options?.onSuccess?.(),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async (id: string) => await mutation.mutateAsync({ id }),
  };
}

/** Rulesets the viewer owns, for the Group detail page's "add a ruleset" picker. */
export function useRulesetsOwnedForGroupAssign() {
  const liveData = useQuery(api.rulesets.listOwnedForGroupAssign, {});
  return toLiveQueryResult(liveData);
}
