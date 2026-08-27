import { v } from 'convex/values';
import type { Infer } from 'convex/values';

/**
 * What one ingest token is allowed to write: exactly one field of one named entity.
 * A consumed token writes where its capability points and nowhere else, so a leaked token is worth one cover on one ruleset at most.
 * The avatar pipeline adds its own member to this union when it joins the ledger path.
 */
export const ingestTokenCapabilityValidator = v.object({
  kind: v.literal('ruleset_cover'),
  ruleset_id: v.id('rulesets'),
});

export type IngestTokenCapability = Infer<typeof ingestTokenCapabilityValidator>;

/**
 * How long a minted token lives.
 * The Worker's whole job fits in seconds (a 10s source fetch cap plus encode and store), so fifteen minutes is generous headroom without leaving stale credentials lying around.
 */
export const INGEST_TOKEN_TTL_MS = 15 * 60 * 1000;
