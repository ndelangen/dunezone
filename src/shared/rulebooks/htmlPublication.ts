import { z } from 'zod';

import { rulebookRenderDocumentV1Schema } from './renderDocument';

export const RULEBOOK_HTML_MAX_PICKUP = 1;

export const takeRulebookHtmlWorkRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
});

export const assignedRulebookHtmlJobSchema = z.strictObject({
  artifactId: z.string().min(1),
  editionId: z.string().min(1),
  rulebookId: z.string().min(1),
  editionNumber: z.number().int().positive(),
  rulebookName: z.string().min(1),
  document: rulebookRenderDocumentV1Schema,
});

export type AssignedRulebookHtmlJob = z.infer<typeof assignedRulebookHtmlJobSchema>;

export const takeRulebookHtmlWorkResponseSchema = z.strictObject({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  items: z.array(assignedRulebookHtmlJobSchema).max(RULEBOOK_HTML_MAX_PICKUP),
});

export const completeRulebookHtmlWorkRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  artifactId: z.string().min(1).max(128),
});

export const failRulebookHtmlWorkRequestSchema = completeRulebookHtmlWorkRequestSchema.extend({
  error: z.string().trim().min(1).max(2000),
});

export const rulebookHtmlWorkOutcomeSchema = z.strictObject({
  ok: z.literal(true),
  status: z.enum(['ready', 'failed', 'missing']),
});

export const resolveRulebookHtmlDeliveryRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal('latest'),
    rulebookId: z.string().min(1),
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal('edition'),
    rulebookId: z.string().min(1),
    editionNumber: z.number().int().positive(),
  }),
]);

export const resolveRulebookHtmlDeliveryResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ ok: z.literal(true), status: z.literal('missing') }),
  z.strictObject({
    ok: z.literal(true),
    status: z.literal('found'),
    editionNumber: z.number().int().positive(),
    key: z.string().min(1),
  }),
]);

export type RulebookHtmlDeliveryResolution = z.infer<typeof resolveRulebookHtmlDeliveryResponseSchema>;
