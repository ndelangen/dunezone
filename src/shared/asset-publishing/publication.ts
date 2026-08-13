import { z } from 'zod';

import { FactionInputSchema, FactionRowSlugSchema } from '../factions/schema';

export const FACTION_SHEET_ASSET_TYPE = 'faction_sheet' as const;
export const PUBLICATION_MAX_ATTEMPTS = 10;
export const PUBLICATION_MAX_PICKUP = 20;
export const PUBLICATION_JOB_EXPIRY_MS = 5 * 60 * 1000;

export const rendererRevisionsSchema = z.record(
  z.string().trim().min(1).max(128),
  z.number().int().nonnegative()
);

export const factionSheetAssetDataSchema = z.strictObject({
  factionId: z.string().min(1),
  slug: FactionRowSlugSchema,
  faction: FactionInputSchema,
});

const publicationJobRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  jobId: z.string().min(1).max(128),
});

export const takePublicationWorkRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
});

export const completePublicationJobRequestSchema = publicationJobRequestSchema.extend({
  cacheToken: z.string().regex(/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/),
});

export const failPublicationJobRequestSchema = publicationJobRequestSchema.extend({
  error: z.string().trim().min(1).max(2000),
});

export const publicationRevisionRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal('initialize'),
    rendererRevisions: rendererRevisionsSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal('read'),
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal('activate'),
    rendererRevisions: rendererRevisionsSchema,
  }),
]);

export type FactionSheetAssetData = z.infer<typeof factionSheetAssetDataSchema>;

/**
 * Wire contract for the executor take-work exchange. The worker parses every response through these
 * schemas; the Convex mutation's id-branded validator stays the server-side authority, linked by a
 * drift test in convex/publicationJobs.test.ts.
 */
const assignedPublicationJobSchema = z.object({
  jobId: z.string(),
  assetType: z.literal('faction_sheet'),
  assetId: z.string(),
  expiresAt: z.number().finite(),
});

export type AssignedPublicationJob = z.infer<typeof assignedPublicationJobSchema>;

export const takeWorkResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('empty'),
    reason: z.enum(['disabled', 'no_pending_work']),
    recovered: z.number().finite(),
    items: z.array(assignedPublicationJobSchema).max(0),
  }),
  z.object({
    status: z.literal('assigned'),
    recovered: z.number().finite(),
    items: z.array(assignedPublicationJobSchema).min(1).max(PUBLICATION_MAX_PICKUP),
  }),
]);

export type TakeWorkResult = z.infer<typeof takeWorkResultSchema>;

const executorEnvelopeSchema = z.looseObject({ ok: z.literal(true), schemaVersion: z.literal(1) });

export function parseTakeWorkResponse(value: unknown): TakeWorkResult {
  executorEnvelopeSchema.parse(value);
  return takeWorkResultSchema.parse(value);
}
