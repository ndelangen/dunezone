import { z } from 'zod';

import type { RulebookEditionArtifactKind, RulebookHtmlRoute, RulebookPdfRoute } from './editionArtifacts';
import { rulebookRenderDocumentV1Schema } from './renderDocument';

/** How many Editions one take-work request assigns, for either format. */
export const RULEBOOK_ARTIFACT_MAX_PICKUP = 1;

const assignedJobFields = {
  artifactId: z.string().min(1),
  editionId: z.string().min(1),
  rulebookId: z.string().min(1),
  editionNumber: z.number().int().positive(),
  rulebookName: z.string().min(1),
  document: rulebookRenderDocumentV1Schema,
};

const assignedHtmlJobSchema = z.strictObject(assignedJobFields);
const assignedPdfJobSchema = z.strictObject({ ...assignedJobFields, editionCreatedAt: z.iso.datetime() });

type AssignedJobs = {
  html: z.infer<typeof assignedHtmlJobSchema>;
  pdf: z.infer<typeof assignedPdfJobSchema>;
};

/** One Edition the executor was assigned to render in format `K`; only the PDF job carries the Edition's creation time. */
export type AssignedRulebookArtifactJob<K extends RulebookEditionArtifactKind = RulebookEditionArtifactKind> =
  AssignedJobs[K];

function takeWorkResponse<Job extends z.ZodType>(job: Job) {
  return z.strictObject({
    ok: z.literal(true),
    schemaVersion: z.literal(1),
    items: z.array(job).max(RULEBOOK_ARTIFACT_MAX_PICKUP),
  });
}

/**
 * The take-work answer for each format.
 * The mapped annotation is what lets a caller holding a generic kind get that kind's job back rather than the union of both.
 */
export const takeRulebookArtifactWorkResponseSchemas: {
  [K in RulebookEditionArtifactKind]: z.ZodType<{ ok: true; schemaVersion: 1; items: AssignedJobs[K][] }>;
} = {
  html: takeWorkResponse(assignedHtmlJobSchema),
  pdf: takeWorkResponse(assignedPdfJobSchema),
};

export const takeRulebookArtifactWorkRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
});

export const completeRulebookArtifactWorkRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  artifactId: z.string().min(1).max(128),
});

export const failRulebookArtifactWorkRequestSchema = completeRulebookArtifactWorkRequestSchema.extend({
  error: z.string().trim().min(1).max(2000),
});

export const rulebookArtifactWorkOutcomeSchema = z.strictObject({
  ok: z.literal(true),
  status: z.enum(['ready', 'failed', 'missing']),
});

/** The route a delivery request names for each format; HTML also has the latest-Edition alias, and PDF has none (#760). */
export type RulebookArtifactRoute<K extends RulebookEditionArtifactKind> = {
  html: RulebookHtmlRoute;
  pdf: RulebookPdfRoute;
}[K];

const resolveHtmlDeliveryRequestSchema = z.discriminatedUnion('kind', [
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

const resolvePdfDeliveryRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  rulebookId: z.string().min(1),
  editionNumber: z.number().int().positive(),
});

type ResolveDeliveryRequests = {
  html: z.infer<typeof resolveHtmlDeliveryRequestSchema>;
  pdf: z.infer<typeof resolvePdfDeliveryRequestSchema>;
};

/** The resolve-delivery request for each format; the HTML body's own `kind` names latest or Edition, and the PDF body always names its Edition. */
export const resolveRulebookArtifactDeliveryRequestSchemas: {
  [K in RulebookEditionArtifactKind]: z.ZodType<ResolveDeliveryRequests[K]>;
} = {
  html: resolveHtmlDeliveryRequestSchema,
  pdf: resolvePdfDeliveryRequestSchema,
};

/** A resolve-delivery request of either format, for a caller that serves both formats from one route definition. */
export type ResolveRulebookArtifactDeliveryRequest = ResolveDeliveryRequests[RulebookEditionArtifactKind];

export const resolveRulebookArtifactDeliveryResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ ok: z.literal(true), status: z.literal('missing') }),
  z.strictObject({
    ok: z.literal(true),
    status: z.literal('found'),
    editionNumber: z.number().int().positive(),
    key: z.string().min(1),
  }),
]);

export type RulebookArtifactDeliveryResolution = z.infer<typeof resolveRulebookArtifactDeliveryResponseSchema>;
