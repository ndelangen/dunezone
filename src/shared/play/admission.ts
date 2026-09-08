import { z } from 'zod';

export const PLAY_FIXTURE_KEY = 'hosted-demo';
export const PLAY_TICKET_TTL_MS = 30_000;
export const PLAY_PENDING_TIMEOUT_MS = 5000;
export const PLAY_AUTH_LEASE_MS = 10_000;
export const PLAY_AUTH_RENEWAL_MS = 3000;
export const PLAY_REQUEST_TIMEOUT_MS = 3000;
export const PLAY_PROVISION_TIMEOUT_MS = 60_000;
export const PLAY_AUTHORIZATION_BATCH_SIZE = 64;

export const PLAY_REDEEM_TICKET_FUNCTION = 'playAdmission:redeemTicket';
export const PLAY_WATCH_AUTHORIZATIONS_FUNCTION = 'playAdmission:watchAuthorizations';
export const PLAY_RECONCILE_ACCOUNTS_FUNCTION = 'playAdmission:reconcileAccounts';
export const PLAY_ACK_ACCOUNT_DELETION_FUNCTION = 'playAdmission:ackAccountDeletion';
export const PLAY_VALIDATE_PROVISIONING_FUNCTION = 'playProvisioning:validateProvisioning';
export const PLAY_CONFIRM_PROVISIONING_FUNCTION = 'playProvisioning:confirmProvisioning';

const identifierSchema = z.string().min(1).max(128);
const playCredentialSchema = z.string().regex(/^[0-9a-f]{64}$/);
const timestampSchema = z.number().finite().nonnegative();
const refusedSchema = z.object({ ok: z.literal(false) });
const gameCredentialFields = { gameId: identifierSchema, secret: playCredentialSchema };

export const playProvisionRequestSchema = z.strictObject({
  ...gameCredentialFields,
  attemptId: playCredentialSchema,
});
export const playProvisioningValidationSchema = z.union([
  refusedSchema,
  z.object({
    ok: z.literal(true),
    gameId: identifierSchema,
    attemptId: playCredentialSchema,
    fixtureKey: z.literal(PLAY_FIXTURE_KEY),
    expiresAt: timestampSchema,
  }),
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
    displayName: z.string().max(256),
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
