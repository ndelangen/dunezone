import { zodToConvex } from 'convex-helpers/server/zod4';

import {
  Background,
  CanonicalFactionStoredObject,
  CatalogueFactionStoredSchema,
} from '../../src/shared/factions/schema';

/**
 * Wire validators for faction payloads, derived from their authority, the canonical faction Zod schemas (ADR-0002).
 * Zod still owns semantic rules (parsed in handlers via the catalogue helpers);
 * these derived validators give the wire the same structural contract instead of `v.any()`.
 * Exception: `extras` reads through a preprocess that drops the retired link lists, which derives as `v.any()`, so the wire leaves its shape to the Zod parse.
 * Derived from the object rather than the parse schema: handlers return parsed data, so the wire carries the Faction leader as `factionLeader` alone, never the old `hero` key.
 */
export const factionDataValidator = zodToConvex(CanonicalFactionStoredObject);

/** The catalogue's narrowed `data`, derived from the same authority as the full shape (#642). */
export const catalogueFactionDataValidator = zodToConvex(CatalogueFactionStoredSchema);
export const factionBackgroundValidator = zodToConvex(Background);
