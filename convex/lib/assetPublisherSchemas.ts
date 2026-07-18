import { z } from 'zod';

import {
  KNOWN_FACTION_SHEET_RENDERER_VERSIONS,
  MAX_PUBLISHER_ITEMS,
} from './assetPublisherConstants';

export const publisherTokenSchema = z.string().min(16).max(256);
export const rendererVersionSchema = z.string().trim().min(1).max(128);

export const takeWorkArgsSchema = z.strictObject({
  claimTokens: z
    .array(publisherTokenSchema)
    .min(1)
    .max(MAX_PUBLISHER_ITEMS)
    .refine((tokens) => new Set(tokens).size === tokens.length, 'Claim tokens must be unique'),
});

export const exactItemClaimSchema = z.strictObject({
  targetId: z.string().min(1),
  claimToken: publisherTokenSchema,
  generation: z.number().int().positive(),
  rendererVersion: rendererVersionSchema,
});

export const completionMetadataSchema = z.strictObject({
  r2Etag: z.string().trim().min(1).max(512),
  bytes: z.number().int().positive(),
  cacheToken: z.string().regex(/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/),
});

export const itemFailureSchema = z.strictObject({
  attribution: z.enum(['target', 'infrastructure']),
  error: z.string().trim().min(1).max(2_000),
});

export const operatorRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({ schemaVersion: z.literal(1), operation: z.literal('initialize') }),
  z.strictObject({ schemaVersion: z.literal(1), operation: z.literal('pause') }),
  z.strictObject({ schemaVersion: z.literal(1), operation: z.literal('disable') }),
  z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal('activate'),
    rendererVersion: z.enum(KNOWN_FACTION_SHEET_RENDERER_VERSIONS),
  }),
]);

const rolloutIdSchema = z.string().trim().min(1).max(128);
const supportedRolloutRendererSchema = z.enum(KNOWN_FACTION_SHEET_RENDERER_VERSIONS);

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

export const takeWorkRequestSchema = z.strictObject({ schemaVersion: z.literal(1) });

export const exactItemRequestSchema = exactItemClaimSchema.extend({
  schemaVersion: z.literal(1),
});

export const completeItemRequestSchema = exactItemRequestSchema.extend({
  r2Etag: z.string().trim().min(1).max(512),
  bytes: z.number().int().positive(),
  cacheToken: z.string().regex(/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/),
});

export const failItemRequestSchema = exactItemRequestSchema.extend({
  attribution: z.enum(['target', 'infrastructure']),
  error: z.string().trim().min(1).max(2_000),
});
