import { nameWithVariant } from '@shared/factions/variantName';

import type { ListedFactionToken } from './FactionTokenFace';

/**
 * How a tool's faction search words a row: to add, already at the table (`here`), or kept out by a seated sibling.
 * A tool seats one variant per Faction, so a row whose sibling is seated carries a `note` saying which variant is.
 */
export function searchRowSeating(
  faction: Pick<ListedFactionToken, 'name' | 'variant' | 'seatedAs'>,
  here: boolean
): Readonly<{ note?: string; label: string }> {
  const name = nameWithVariant(faction.name, faction.variant);
  if (here) {
    return { label: `${name} is at the table` };
  }
  if (faction.seatedAs !== undefined) {
    const note = `Seated as ${faction.seatedAs}`;
    return { note, label: `${name}: ${note}` };
  }
  return { label: `Add ${name}` };
}
