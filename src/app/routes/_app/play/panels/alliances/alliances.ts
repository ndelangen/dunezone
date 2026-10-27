import { alliesOf } from '@shared/play/alliances';
import type { AllianceAction, AllianceState } from '@shared/play/alliances';

/** How the viewer's faction stands with one faction at the table. */
export type Relation = 'own-allied' | 'own' | 'ally' | 'incoming' | 'outgoing' | 'none';

export type AllianceCommandKind =
  | 'alliance-offer'
  | 'alliance-withdraw'
  | 'alliance-accept'
  | 'alliance-decline'
  | 'alliance-break';

/** Factions' names as one phrase: "A", "A and B", "A, B and C". */
export function factionList(names: Readonly<Record<string, string>>, ids: readonly string[]) {
  const labels = ids.map((id) => names[id] ?? id);
  return labels.length < 2 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

function hasOffer(alliances: AllianceState | undefined, from: string | undefined, to: string | undefined) {
  return alliances?.offers.some((offer) => offer.from === from && offer.to === to) ?? false;
}

export function relationTo(alliances: AllianceState | undefined, own: string, factionId: string): Relation {
  const allies = alliesOf(alliances, own);
  if (factionId === own) {
    return allies.length ? 'own-allied' : 'own';
  }
  if (allies.includes(factionId)) {
    return 'ally';
  }
  if (hasOffer(alliances, factionId, own)) {
    return 'incoming';
  }
  return hasOffer(alliances, own, factionId) ? 'outgoing' : 'none';
}

/*
 * The command for one of the viewer's alliance actions about `factionId`.
 * Breaking names an ally the viewer saw, so a late click never leaves an alliance formed since; a withdrawal or an answer names the offer the viewer saw.
 */
export function allianceAction(
  alliances: AllianceState | undefined,
  kind: AllianceCommandKind,
  own: string,
  factionId: string
): AllianceAction | null {
  if (kind === 'alliance-offer') {
    return { kind, factionId };
  }
  if (kind === 'alliance-break') {
    return { kind, factionId: alliesOf(alliances, own)[0] ?? own };
  }
  const [from, to] = kind === 'alliance-withdraw' ? [own, factionId] : [factionId, own];
  const offer = alliances?.offers.find((entry) => entry.from === from && entry.to === to);
  return offer ? { kind, factionId, offer: offer.id } : null;
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
    return 'Your offer is waiting';
  }
  const allies = alliesOf(alliances, factionId);
  return allies.length ? `Allied with ${factionList(names, allies)}` : 'No alliance';
}
