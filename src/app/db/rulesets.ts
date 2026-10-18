import { assetSubjectFacts } from '@shared/access/collaborativeAccess';
import type { AssetViewerAccess } from '@shared/access/collaborativeAccess';
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
import { toLiveQueryResult, useLiveMutation, useLiveQuery } from '@app/db/core/live';
import { useAssetAccess, useViewerAssignableGroups, UNAVAILABLE_SUBJECT } from '@app/db/viewerAccess';

import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import type { AssignedGroupSummary } from '../../../convex/lib/collaborativeAccess';
import type { ProfileSummary } from '../../../convex/lib/collaborativeAccessValidators';

/** What a caller authors, derived from the schema that validates it. Both fields are required, and About sits above its floor. */
export type Ruleset = RulesetInput;
/** A ruleset straight from Convex. `name` and `about` are unparsed and there is no `coverUrl`; `rulesetRowsToEntries` adds both. */
export type RulesetRow = Doc<'rulesets'>;
/** A ruleset row after the client boundary: `name` and `about` parsed, an `id` alias, and the two cover URLs derived below. */
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
/** What `api.rulesets.page` gives a page: the ruleset and the factions on it, nothing about the viewer. */
export type RulesetPageData = {
  ruleset: RulesetEntry;
  /** Catalogue-shaped, so the page renders its factions with the same vocabulary the catalogue uses. */
  factions: FactionCatalogueEntry[];
};

/** One asset a ruleset has slotted: enough to name it and link to it, since a slot list is not a catalogue. */
type RulesetSlottedAsset = { slot: string; asset: { id: string; type: string; slug: string; name: string } };

/** What `api.rulesets.detailPage` gives the detail routes, the same for every viewer: the page data plus everything the toolbar and FAQ draw. */
export type RulesetDetailPublicPage = {
  ruleset: RulesetEntry;
  /** The first few factions in the ruleset's own order; the rest are in the catalogue under this ruleset's filter. */
  factionPreview: FactionCatalogueEntry[];
  /** Every live faction the ruleset has. */
  factionCount: number;
  assignedGroup: AssignedGroupSummary | null;
  owner: ProfileSummary | null;
  /** The newest few questions; the rest are on the ruleset's FAQ page. */
  faqPreview: FaqItemWithDetails[];
  /** Every question the ruleset has, and how many have an accepted answer. */
  faqCounts: { questions: number; answered: number };
  assetSlots: RulesetSlottedAsset[];
  /** The slotted board with its publication, or null when the slot is empty. */
  board: { id: string; type: string; slug: string; name: string; previewHref: string | null } | null;
  rulebooks: NonNullable<FunctionReturnType<typeof api.rulesets.detailPage>>['rulebooks'];
};

/**
 * The detail page as a route draws it: the public page combined with what this viewer may do.
 * `viewerResolved` is false while the viewer is on its way;
 * until then the capabilities are the anonymous ones.
 */
type RulesetDetailPageData = RulesetDetailPublicPage & {
  viewerResolved: boolean;
  viewerAccess: AssetViewerAccess<'ruleset', AssignedGroupSummary>;
  assignableGroups: AssignedGroupSummary[];
};

function toRulesetPageData(raw: FunctionReturnType<typeof api.rulesets.page>): RulesetPageData {
  return {
    ruleset: toRulesetEntry(raw.ruleset),
    factions: factionCatalogueRowsToEntries(raw.factions),
  };
}

/** Canonical detail page model, shared by the route loader and the live subscription. */
function normalizeRulesetDetailPage(
  raw: NonNullable<FunctionReturnType<typeof api.rulesets.detailPage>>
): RulesetDetailPublicPage {
  return {
    ruleset: toRulesetEntry(raw.ruleset),
    factionPreview: factionCatalogueRowsToEntries(raw.factionPreview),
    factionCount: raw.factionCount,
    assignedGroup: raw.assignedGroup,
    owner: raw.owner,
    faqPreview: mapFaqItemsFromConvex(raw.faqPreview),
    faqCounts: raw.faqCounts,
    assetSlots: raw.assetSlots,
    board: raw.board,
    rulebooks: raw.rulebooks,
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

/** Parses Convex ruleset rows at the client boundary. Anything reading `name`, `about` or a cover URL wants entries, not rows. */
export function rulesetRowsToEntries(entries: RulesetRow[]): RulesetEntry[] {
  return entries.map(toRulesetEntry);
}

/** The index route's loader, paired with `useRulesetsAll`. */
export async function loadRulesetsAll(): Promise<RulesetEntry[]> {
  const entries = await db.query(api.rulesets.list, {});
  return rulesetRowsToEntries(entries);
}

/** The loader behind pages that need the ruleset and its factions only, paired with `useRulesetBySlug`. */
export async function loadRulesetBySlug(slug: string): Promise<RulesetPageData> {
  const result = await db.query(api.rulesets.page, { slug });
  return toRulesetPageData(result);
}

/**
 * The detail route's loader, paired with `useRulesetDetailPage`.
 * Resolves `null` for a slug naming no ruleset rather than throwing, so the route renders its own not-found frame;
 * the other two loaders here throw.
 */
export async function loadRulesetDetailPage(slug: string): Promise<RulesetDetailPublicPage | null> {
  const raw = await db.query(api.rulesets.detailPage, { slug });
  return raw ? normalizeRulesetDetailPage(raw) : null;
}

/** Every ruleset, live. Hand `loadRulesetsAll`'s result as `initialData` so the first paint is not empty. */
export function useRulesetsAll(options?: { initialData?: RulesetEntry[] }) {
  const liveData = useLiveQuery(api.rulesets.list, {});
  const normalized = liveData?.map(toRulesetEntry);
  return toLiveQueryResult(normalized, () => options?.initialData);
}

/** One ruleset with its factions, live, taking `loadRulesetBySlug`'s result as `initialData`. */
export function useRulesetBySlug(slug: string, options?: { initialData?: RulesetPageData }) {
  const liveData = useLiveQuery(api.rulesets.page, { slug });
  const normalized = liveData ? toRulesetPageData(liveData) : undefined;
  const result = toLiveQueryResult(normalized, () => options?.initialData);
  return result;
}

/**
 * The detail routes' live page, taking `loadRulesetDetailPage`'s result as `initialData`, combined with the viewer.
 * The page query is one cached answer for everyone;
 * the viewer half is the session, the viewer's membership of the ruleset's Group and the Groups they could move it into.
 */
export function useRulesetDetailPage(slug: string, options?: { initialData?: RulesetDetailPublicPage }) {
  const liveData = useLiveQuery(api.rulesets.detailPage, { slug });
  const normalized: RulesetDetailPublicPage | null | undefined =
    liveData === undefined ? undefined : liveData === null ? null : normalizeRulesetDetailPage(liveData);
  const result = toLiveQueryResult(normalized, () => options?.initialData);
  const page = result.data;
  const { resolved, viewerAccess } = useAssetAccess(
    assetSubjectFacts('ruleset', page?.ruleset ?? UNAVAILABLE_SUBJECT, page?.assignedGroup ?? null)
  );
  const assignableGroups = useViewerAssignableGroups();
  const data: RulesetDetailPageData | null | undefined = page
    ? { ...page, viewerResolved: resolved, viewerAccess, assignableGroups }
    : page;
  return { ...result, data };
}

/** A ruleset's first `limit` factions in its own order, live, and whether more remain; a larger limit loads more. */
export function useOrderedRulesetFactions(rulesetId: Id<'rulesets'>, limit: number) {
  /* Not held: each Load more is a longer prefix, and holding the shorter ones would keep them all subscribed. */
  return useLiveQuery(api.rulesets.orderedFactions, { rulesetId, limit }, { hold: false });
}

/** Puts a ruleset's factions in the order given; the ones it leaves out follow, in their current order. */
export function useReorderRulesetFactions() {
  const mutation = useLiveMutation<{ ruleset_id: Id<'rulesets'>; faction_ids: Id<'factions'>[] }, null>(
    api.rulesets.reorderFactions
  );
  return {
    ...mutation,
    mutate: (
      variables: { rulesetId: Id<'rulesets'>; factionIds: Id<'factions'>[] },
      options?: { onError?: () => void }
    ) =>
      mutation.mutate(
        { ruleset_id: variables.rulesetId, faction_ids: variables.factionIds },
        { onError: () => options?.onError?.() }
      ),
  };
}

/** Creates a ruleset. `onSuccess` receives the new entry with the `route_notice` the redirect reads. */
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

/** Saves a ruleset's name, about and cover. Omitting `image_cover` leaves the stored cover alone; passing `null` clears it. */
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

/** Puts an asset in one of a ruleset's slots. `mutate({ rulesetId, assetId, slot })`, camelCase; the snake_case boundary stops here. */
export function useSetRulesetAssetSlot() {
  return useRulesetAssetSlotMutation(api.rulesets.setAssetSlot);
}

/** Empties one of a ruleset's slots, taking the same three arguments as `useSetRulesetAssetSlot`. */
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

/** Unlinks a faction from a ruleset. `mutate({ rulesetId, factionId })`, the mirror of `useAddRulesetFaction`. */
export function useRemoveRulesetFaction() {
  return useRulesetFactionLinkMutation(api.rulesets.removeFaction);
}

/** Soft-deletes a ruleset by id. The row stays and stops being served. */
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
