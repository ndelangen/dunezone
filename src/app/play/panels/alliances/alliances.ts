import { alliesOf, hasOffer } from '@shared/play/alliances';
import type { AllianceState } from '@shared/play/alliances';

export { allianceAction, relationTo } from '@shared/play/alliances';
export type { AllianceCommandKind, Relation } from '@shared/play/alliances';

/** Factions' names as one phrase: "A", "A and B", "A, B and C". */
export function factionList(names: Readonly<Record<string, string>>, ids: readonly string[]) {
  const labels = ids.map((id) => names[id] ?? id);
  return labels.length < 2 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

/** What a faction's row says about its alliance, from the viewer's side where an offer is between them. */
export function allianceStatus(
  alliances: AllianceState | undefined,
  factionId: string,
  own: string | undefined,
  names: Readonly<Record<string, string>>
) {
  if (hasOffer(alliances, factionId, own)) {
    return 'Offers you an alliance';
  }
  if (hasOffer(alliances, own, factionId)) {
    return 'Offering…';
  }
  const allies = alliesOf(alliances, factionId);
  if (own && allies.includes(own)) {
    return 'Your ally';
  }
  return allies.length ? `Allied with ${factionList(names, allies)}` : 'No alliance';
}
