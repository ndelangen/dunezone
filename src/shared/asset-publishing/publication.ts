import { z } from 'zod';

import { FactionInputSchema, FactionRowSlugSchema } from '../../game/schema/faction';

export const FACTION_SHEET_ASSET_TYPE = 'faction_sheet' as const;
export const PUBLICATION_MAX_ATTEMPTS = 10;
export const PUBLICATION_MAX_PICKUP = 20;
export const PUBLICATION_JOB_EXPIRY_MS = 5 * 60 * 1_000;

export const rendererRevisionsSchema = z.record(
  z.string().trim().min(1).max(128),
  z.number().int().nonnegative()
);

export const factionSheetAssetDataSchema = z.strictObject({
  factionId: z.string().min(1),
  slug: FactionRowSlugSchema,
  faction: FactionInputSchema,
});

export const publicationJobRequestSchema = z.strictObject({
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
  error: z.string().trim().min(1).max(2_000),
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
