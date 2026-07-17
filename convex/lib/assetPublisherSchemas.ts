import { z } from 'zod';

export const assetTypeSchema = z.literal('faction_sheet');
export const publisherTokenSchema = z.string().min(16).max(256);
export const rendererVersionSchema = z.string().trim().min(1).max(128);
export const payloadHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const exactClaimSchema = z.strictObject({
  targetId: z.string().min(1),
  batchToken: publisherTokenSchema,
  claimToken: publisherTokenSchema,
  generation: z.number().int().positive(),
  rendererVersion: rendererVersionSchema,
});

export const completionMetadataSchema = z.strictObject({
  r2Etag: z.string().trim().min(1).max(512),
  bytes: z.number().int().positive(),
  cacheToken: z.string().regex(/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/),
});

export const failureSchema = z.strictObject({
  error: z.string().trim().min(1).max(2_000),
});

export const pollRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  scheduledCutoff: z.iso.datetime(),
  triggerId: z.uuid(),
});

export const operatorRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({ schemaVersion: z.literal(1), operation: z.literal('initialize') }),
  z.strictObject({ schemaVersion: z.literal(1), operation: z.literal('pause') }),
  z.strictObject({ schemaVersion: z.literal(1), operation: z.literal('disable') }),
  z.strictObject({ schemaVersion: z.literal(1), operation: z.literal('activate') }),
]);

const rolloutIdSchema = z.string().trim().min(1).max(128);
const supportedRolloutRendererSchema = z.literal('faction-sheet-v1');

export const rolloutOperatorRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal('create_paused'),
    targetRendererVersion: supportedRolloutRendererSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal('resume'),
    rolloutId: rolloutIdSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal('pause'),
    rolloutId: rolloutIdSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal('cancel'),
    rolloutId: rolloutIdSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal('rollback'),
    rolloutId: rolloutIdSchema,
    targetRendererVersion: supportedRolloutRendererSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal('progress'),
    rolloutId: rolloutIdSchema.optional(),
  }),
]);

export const acquireRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  batchToken: publisherTokenSchema,
});

export const settleBrowserRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  batchToken: publisherTokenSchema,
  measuredBrowserMs: z.number().int().min(0).max(900_000),
});

export const releaseBatchRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  batchToken: publisherTokenSchema,
  mode: z.enum(['no_browser', 'after_settlement']),
});

export const claimRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  batchToken: publisherTokenSchema,
});

export const exactClaimRequestSchema = exactClaimSchema.extend({
  schemaVersion: z.literal(1),
  retainBatch: z.boolean().optional(),
});

export const completeRequestSchema = exactClaimRequestSchema.extend({
  r2Etag: z.string().trim().min(1).max(512),
  bytes: z.number().int().positive(),
});

export const failRequestSchema = exactClaimRequestSchema.extend({
  error: z.string().trim().min(1).max(2_000),
});

export const renderCapabilityPayloadSchema = z.strictObject({
  version: z.literal(1),
  factionId: z.string().min(1),
  assetType: assetTypeSchema,
  payloadHash: payloadHashSchema,
  generation: z.number().int().positive(),
  rendererVersion: rendererVersionSchema,
  batchToken: publisherTokenSchema,
  claimToken: publisherTokenSchema,
  expiresAt: z.number().int().positive(),
});

export type RenderCapabilityPayload = z.infer<typeof renderCapabilityPayloadSchema>;
