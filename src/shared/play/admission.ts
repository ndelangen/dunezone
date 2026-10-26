import { z } from 'zod';

import { lastTurnSchema } from './lastTurn';
import { PHASE_CHANGE_COOLDOWN_MS } from './phases';
import { tableSeatCountSchema } from './schema';

export const PLAY_FIXTURE_KEY = 'hosted-demo';
export const PLAY_PENDING_TIMEOUT_MS = 5000;
/** The longest wait between reconnects while every admission keeps failing before the room seats the page. */
export const PLAY_ADMISSION_RETRY_MAX_MS = 30_000;
/* The first wait before the room asks Convex again after a failed read. */
export const PLAY_AUTH_RECOVERY_MS = 1000;
export const PLAY_REQUEST_TIMEOUT_MS = 3000;
export const PLAY_PROVISION_TIMEOUT_MS = 60_000;
export const PLAY_CONFIRMATION_RETRY_MS = 2000;
export const PLAY_CONFIRMATION_RECOVERY_MS = 30_000;
/**
 * The longest name a game receives for a Player.
 * Convex cuts a longer profile name to it before the game Worker sees it.
 */
export const PLAY_DISPLAY_NAME_MAX_LENGTH = 256;
/*
 * The longest profile slug the game Worker carries, the same bound as its stored names; Convex sends null for a longer
 * one, so the player is cited unlinked.
 */
export const PLAY_PROFILE_SLUG_MAX_LENGTH = 160;
/* A player's public profile slug, so the table can link to their profile; null for an inactive account. */
const playProfileSlugSchema = z.string().min(1).max(PLAY_PROFILE_SLUG_MAX_LENGTH).nullable().optional();

const identifierSchema = z.string().min(1).max(128);
const playCredentialSchema = z.string().regex(/^[0-9a-f]{64}$/);
const timestampSchema = z.number().finite().nonnegative();
const refusedSchema = z.object({ ok: z.literal(false) });
export const gameCredentialFields = { gameId: identifierSchema, secret: playCredentialSchema };

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
  /* Chosen on the create page; a game created before that plays the standard ten turns. */
  lastTurn: lastTurnSchema.optional(),
  creator: z.object({
    userId: identifierSchema,
    displayName: z.string().max(PLAY_DISPLAY_NAME_MAX_LENGTH),
    /* The creator's public avatar, a delivery URL or null; the draft ledger draws players by it. */
    avatarUrl: z.string().max(2048).nullable().optional(),
    profileSlug: playProfileSlugSchema,
  }),
});
/*
 * A synthetic backend's phase cooldown for the games it provisions, from its `PLAY_TEST_PHASE_COOLDOWN_MS`.
 * It can only shorten the real cooldown, and the game Worker accepts it only in the isolated local runtime.
 */
export const playTestPhaseCooldownSchema = z.number().int().min(0).max(PHASE_CHANGE_COOLDOWN_MS);
/*
 * The stage a synthetic backend asks a real game to be provisioned at, so a browser flow that does not test drafting and setup starts in play (#1594).
 * The game Worker honours it only in the isolated local runtime, and reaches the stage through the commands players would send.
 */
export const playTestStartStageSchema = z.literal('play');
/*
 * The accounts that take a provisioned game to Turn 1 in place of players (#1594).
 * The game Worker mints one for each seat the creator does not hold.
 */
const PROVISION_PLACEHOLDER_PREFIX = 'provision-seat-';
export function provisionPlaceholderId(seat: number) {
  return `${PROVISION_PLACEHOLDER_PREFIX}${seat}`;
}
const validatedAttemptSchema = playPendingProvisionSchema.omit({ secret: true }).extend({
  ok: z.literal(true),
  testPhaseCooldownMs: playTestPhaseCooldownSchema.optional(),
  testStartStage: playTestStartStageSchema.optional(),
});
/* A validated attempt is a fixture or a real game; a row that is neither is refused, never provisioned as a fixture. */
export const playProvisioningValidationSchema = z.union([
  refusedSchema,
  validatedAttemptSchema.extend({ fixtureKey: z.literal(PLAY_FIXTURE_KEY) }).strip(),
  validatedAttemptSchema.extend({ game: playGameProvisionSchema, provisional: z.boolean().optional() }).strip(),
]);
export const playConfirmationSchema = z.object({ ok: z.boolean() });

/*
 * Enrolling and renewing both answer with a fresh seat pass.
 * Enrolling happens once per account per game; renewing only when a held pass nears its end with no fresher one from the game query.
 */
export const playSeatPassRequestSchema = z.strictObject({ gameId: identifierSchema });
export const playSeatPassResultSchema = z.union([
  z.object({ ok: z.literal(true), pass: z.string().max(4096) }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['not_authorized', 'unavailable', 'rate_limited']),
    retryAfterMs: z.number().nonnegative().optional(),
  }),
]);
/* The room asks once per seat request whether the requester already holds the seat limit elsewhere; a pass carries no such flag. */
export const playSeatLimitRequestSchema = z.strictObject({ ...gameCredentialFields, userId: identifierSchema });
export const playSeatLimitResultSchema = z.union([
  refusedSchema,
  z.object({ ok: z.literal(true), reached: z.boolean() }),
]);
export const playAccountDeletionRequestSchema = z.strictObject({
  ...gameCredentialFields,
  eventId: identifierSchema,
  userId: identifierSchema,
  deletionOperationId: identifierSchema,
});
/*
 * An account-wide sign-out reaching a room: every pass of `principalId` from a session created at or before `through` stops working there.
 * Convex retries it until the room acknowledges, and the room stores the cutoff before it answers.
 */
export const playSessionCutoffRequestSchema = z.strictObject({
  ...gameCredentialFields,
  eventId: identifierSchema,
  principalId: identifierSchema,
  through: timestampSchema,
});
export const playAckSessionCutoffRequestSchema = z.strictObject({
  ...gameCredentialFields,
  eventId: identifierSchema,
  through: timestampSchema,
});
export const playAckAccountDeletionRequestSchema = z.strictObject({
  ...gameCredentialFields,
  eventId: identifierSchema,
});

/** The lifecycle stage a game is in. Fixtures have none and play from their first view. */
export const playStageSchema = z.enum(['drafting', 'swapping', 'setup', 'play', 'finished', 'discarded']);

/** Whether players may handle the table's pieces: on a fixture, during setup and in play, but never before setup or once the game is finished or discarded. */
export function tableHandlingOpen(stage: z.infer<typeof playStageSchema> | undefined) {
  return stage === undefined || stage === 'setup' || stage === 'play';
}

export const playCreateGameRequestSchema = z.strictObject({
  rulesetId: identifierSchema,
  minimumPlayers: playMinimumPlayersSchema,
  lastTurn: lastTurnSchema.optional(),
});
export const playCreateGameResultSchema = z.union([
  z.object({ ok: z.literal(true), gameId: identifierSchema }),
  z.object({ ok: z.literal(false), reason: z.enum(['not_authorized', 'unavailable', 'rate_limited']) }),
]);

/*
 * What a game page learns about an address before it opens a socket.
 * An address that names no game reads as not found; a pending game is
 * preparing and an expired one unavailable, neither a lifecycle stage.
 */
const gameAddress = { gameId: identifierSchema, name: z.string(), slug: z.string().nullable() };
export const playGameAddressAccessSchema = z.union([
  z.object({ status: z.literal('sign_in_required') }),
  z.object({ status: z.literal('not_found') }),
  z.object({ status: z.literal('preparing'), ...gameAddress }),
  z.object({ status: z.literal('unavailable'), ...gameAddress, reason: playProvisionFailureReasonSchema.optional() }),
  z.object({
    status: z.literal('ready'),
    ...gameAddress,
    ruleset: z.object({ slug: z.string(), name: z.string() }).nullable(),
    minimumPlayers: playMinimumPlayersSchema.nullable(),
    /*
     * The viewer's seat pass for this game, renewed whenever the query re-runs (each sign-in refresh does).
     * Null until the account is enrolled here, which the page asks for once with `playAdmission.enrolPlayer`.
     */
    pass: z.string().max(4096).nullable(),
  }),
]);
