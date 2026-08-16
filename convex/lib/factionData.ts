import { zodToConvex } from 'convex-helpers/server/zod4';

import { Background, CanonicalFactionStoredSchema } from '../../src/shared/factions/schema';

/**
 * Wire validators for faction payloads, derived from their authority — the canonical faction Zod schemas (ADR-0002).
 * Zod still owns semantic rules (parsed in handlers via the catalogue helpers); these derived validators give the wire
 * the same structural contract instead of `v.any()`.
 */
export const factionDataValidator = zodToConvex(CanonicalFactionStoredSchema);
export const factionBackgroundValidator = zodToConvex(Background);
