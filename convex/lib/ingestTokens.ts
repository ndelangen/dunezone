import { v } from 'convex/values';
import type { Infer } from 'convex/values';

/**
 * What one ingest token is allowed to write: exactly one field of one named entity.
 * A consumed token writes where its capability points and nowhere else, so a leaked token is worth one cover on one ruleset, or one avatar on one profile, at most.
 */
export const ingestTokenCapabilityValidator = v.union(
  v.object({
    kind: v.literal('ruleset_cover'),
    ruleset_id: v.id('rulesets'),
    /**
     * What `image_cover` must still read at consume time, present only on a mint that has an expectation to defend.
     * The operator backfill sets it to the legacy string its scan saw, so a result that lands after an author rehosted bounces as superseded instead of overwriting them.
     * The author path omits it: a save mints against a URL the document does not carry yet, since the rehost runs before the update and the document only ever holds our delivery URL.
     * The avatar arm needs no such field because its mutation writes the source first, so the pinned `source_url` is already the echo.
     */
    expected_echo: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('profile_avatar'),
    profile_id: v.id('profiles'),
  })
);

export type IngestTokenCapability = Infer<typeof ingestTokenCapabilityValidator>;

/** The kind alone, which the check query hands the Worker so the rendition recipe comes from the ledger rather than the request body. */
export const ingestTokenCapabilityKindValidator = v.union(v.literal('ruleset_cover'), v.literal('profile_avatar'));

/**
 * How long a minted token lives.
 * The Worker's whole job fits in seconds (a 10s source fetch cap plus encode and store), so fifteen minutes is generous headroom without leaving stale credentials lying around.
 */
export const INGEST_TOKEN_TTL_MS = 15 * 60 * 1000;
