import { z } from 'zod';

/**
 * Where an asset's replacement capture stands, as its Publication jobs say: running, waiting, or failed on its last attempt.
 * It is the one spelling for every asset publication: the Convex projection types and validates against it, and a Cardback preset carries it as is.
 * A failed replacement leaves the existing publication current (CONTEXT.md, Asset publication state).
 */
export const assetCaptureStatusSchema = z.enum(['scheduled', 'in_progress', 'error']);
