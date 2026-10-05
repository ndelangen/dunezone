import { useQuery } from 'convex/react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { toLiveQueryResult } from './core/live';

/** Mounted only while the source picker is choosing a member of this faction. */
export function useRulebookFactionMembers(factionId: string) {
  const data = useQuery(api.rulebookSources.factionMembers, { faction_id: factionId as Id<'factions'> });
  return toLiveQueryResult(data);
}

/* Mounted only while the source picker is choosing a troop of this faction. */
export function useRulebookFactionTroops(factionId: string) {
  const data = useQuery(api.rulebookSources.factionTroops, { faction_id: factionId as Id<'factions'> });
  return toLiveQueryResult(data);
}
