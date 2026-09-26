import { z } from 'zod';

import { loadProfileSchema } from './loadProfile';
import { tableSeatCountSchema } from './schema';

export const PLAY_FIXTURE_KEY = 'hosted-demo';
export const PLAY_TICKET_TTL_MS = 30_000;
export const PLAY_PENDING_TIMEOUT_MS = 5000;
/*
 * The reactive subscription is the prompt path for revocation. The uncached lease bounds a stalled
 * subscription over a live transport; the lease must exceed the renewal cadence plus the request
 * timeout so a healthy renewal lands before the previous lease ends. A dead transport is bounded by
 * the Convex client's own inactivity reconnect (60 seconds in convex 1.45.0), not by these values.
 * Decided at https://github.com/ndelangen/dunezone/issues/1014#issuecomment-5649336152.
 */
export const PLAY_AUTH_LEASE_MS = 300_000;
export const PLAY_AUTH_RENEWAL_MS = 90_000;
export const PLAY_AUTH_RECOVERY_MS = 1000;
export const PLAY_REQUEST_TIMEOUT_MS = 3000;
export const PLAY_PROVISION_TIMEOUT_MS = 60_000;
export const PLAY_CONFIRMATION_RETRY_MS = 2000;
export const PLAY_CONFIRMATION_RECOVERY_MS = 30_000;
export const PLAY_AUTHORIZATION_BATCH_SIZE = 64;
/**
 * The longest name a game receives for a Player.
 * Convex cuts a longer profile name to it before the game Worker sees it.
 */
export const PLAY_DISPLAY_NAME_MAX_LENGTH = 256;

const identifierSchema = z.string().min(1).max(128);
const playCredentialSchema = z.string().regex(/^[0-9a-f]{64}$/);
const timestampSchema = z.number().finite().nonnegative();
const refusedSchema = z.object({ ok: z.literal(false) });
const gameCredentialFields = { gameId: identifierSchema, secret: playCredentialSchema };

export const playProvisionRequestSchema = z.strictObject({
  ...gameCredentialFields,
  attemptId: playCredentialSchema,
});
export const playPendingProvisionSchema = playProvisionRequestSchema.extend({ expiresAt: timestampSchema });
export const playProvisionFailureReasonSchema = z.string().min(1).max(800);
export const playProvisionFailureSchema = playProvisionRequestSchema.extend({
  reason: playProvisionFailureReasonSchema,
});
/** The minimum player count a game is created with is also its table's seat count. */
const playMinimumPlayersSchema = tableSeatCountSchema;
/*
 * What a real game is provisioned with: its fixed ruleset, its minimum count and its creator, who
 * takes the first seat. `provisional` is true only on an isolated development backend; it lets the
 * game retain catalogue content that is not ready, which production never does.
 */
export const playGameProvisionSchema = z.object({
  rulesetId: identifierSchema,
  minimumPlayers: playMinimumPlayersSchema,
  creator: z.object({
    userId: identifierSchema,
    displayName: z.string().max(PLAY_DISPLAY_NAME_MAX_LENGTH),
    /* The creator's public avatar, a delivery URL or null; the draft ledger draws players by it. */
    avatarUrl: z.string().max(2048).nullable().optional(),
  }),
});
const validatedAttemptSchema = playPendingProvisionSchema.omit({ secret: true }).extend({ ok: z.literal(true) });
/* A validated attempt is a fixture or a real game; a row that is neither is refused, never provisioned as a fixture. */
export const playProvisioningValidationSchema = z.union([
  refusedSchema,
  validatedAttemptSchema
    .extend({ fixtureKey: z.literal(PLAY_FIXTURE_KEY), loadProfile: loadProfileSchema.optional() })
    .strip(),
  validatedAttemptSchema.extend({ game: playGameProvisionSchema, provisional: z.boolean().optional() }).strip(),
]);
export const playConfirmationSchema = z.object({ ok: z.boolean() });

export const playIssueTicketRequestSchema = z.strictObject({ gameId: identifierSchema });
export const playTicketResultSchema = z.union([
  z.object({ ok: z.literal(true), ticket: playCredentialSchema, expiresAt: timestampSchema }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['not_authorized', 'unavailable', 'rate_limited']),
    retryAfterMs: z.number().nonnegative().optional(),
  }),
]);
export const playRedeemTicketRequestSchema = z.strictObject({
  ...gameCredentialFields,
  ticket: playCredentialSchema,
});
export const playRedeemTicketResultSchema = z.union([
  refusedSchema,
  z.object({
    ok: z.literal(true),
    registrationId: identifierSchema,
    userId: identifierSchema,
    sessionId: identifierSchema,
    authExpiresAt: timestampSchema,
    displayName: z.string().max(PLAY_DISPLAY_NAME_MAX_LENGTH),
    avatarUrl: z.string().max(2048).nullable().optional(),
  }),
]);

const identityBatchSchema = z.array(identifierSchema).max(PLAY_AUTHORIZATION_BATCH_SIZE);
export const playWatchAuthorizationsRequestSchema = z.strictObject({
  ...gameCredentialFields,
  generation: identifierSchema,
  registrationIds: identityBatchSchema,
});
const playAuthorizationEntrySchema = z.object({
  registrationId: identifierSchema,
  userId: identifierSchema.nullable(),
  sessionId: identifierSchema.nullable(),
  allowed: z.boolean(),
  authExpiresAt: timestampSchema,
});
export const playWatchAuthorizationsResultSchema = z.union([
  refusedSchema,
  z.object({
    ok: z.literal(true),
    generation: identifierSchema,
    entries: z.array(playAuthorizationEntrySchema).max(PLAY_AUTHORIZATION_BATCH_SIZE),
  }),
]);

export const playReconcileAccountsRequestSchema = z.strictObject({
  ...gameCredentialFields,
  userIds: identityBatchSchema,
});
const playAccountEntrySchema = z.object({
  userId: identifierSchema,
  state: z.enum(['active', 'deletion_pending', 'deleted', 'unknown']),
  deletionOperationId: identifierSchema.nullable(),
});
export const playReconcileAccountsResultSchema = z.union([
  refusedSchema,
  z.object({
    ok: z.literal(true),
    accounts: z.array(playAccountEntrySchema).max(PLAY_AUTHORIZATION_BATCH_SIZE),
  }),
]);
export const playAccountDeletionRequestSchema = z.strictObject({
  ...gameCredentialFields,
  eventId: identifierSchema,
  userId: identifierSchema,
  deletionOperationId: identifierSchema,
});
export const playAckAccountDeletionRequestSchema = z.strictObject({
  ...gameCredentialFields,
  eventId: identifierSchema,
});

export const playFixtureSchema = z.union([
  z.object({ status: z.literal('sign_in_required') }),
  z.object({ status: z.literal('unavailable') }),
  z.object({ status: z.literal('ready'), gameId: identifierSchema, name: z.string() }),
]);

/** The lifecycle stage a game is in. Fixtures have none and play from their first view. */
export const playStageSchema = z.enum(['drafting', 'swapping', 'setup', 'play', 'finished', 'discarded']);

export const playCreateGameRequestSchema = z.strictObject({
  rulesetId: identifierSchema,
  minimumPlayers: playMinimumPlayersSchema,
});
export const playCreateGameResultSchema = z.union([
  z.object({ ok: z.literal(true), gameId: identifierSchema }),
  z.object({ ok: z.literal(false), reason: z.enum(['not_authorized', 'unavailable']) }),
]);

/*
 * What a game page learns before it opens a socket.
 * A game the viewer may not see reads as not found, whether it exists or not; a pending game is
 * preparing and an expired one unavailable, neither a lifecycle stage.
 */
export const playGameAccessSchema = z.union([
  z.object({ status: z.literal('sign_in_required') }),
  z.object({ status: z.literal('not_found') }),
  z.object({ status: z.literal('preparing') }),
  z.object({ status: z.literal('unavailable'), reason: playProvisionFailureReasonSchema.optional() }),
  z.object({
    status: z.literal('ready'),
    gameId: identifierSchema,
    name: z.string(),
    ruleset: z.object({ slug: z.string(), name: z.string() }).nullable(),
    minimumPlayers: playMinimumPlayersSchema.nullable(),
  }),
]);
