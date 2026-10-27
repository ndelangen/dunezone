import { alliesOf } from '@shared/play/alliances';
import type { AllianceAction, AllianceState } from '@shared/play/alliances';

/**
 * How the viewer's faction stands with one faction at the table.
 * `taken` is a faction the viewer can't offer an alliance to, because one of the two is already allied.
 */
export type Relation = 'ally' | 'incoming' | 'outgoing' | 'none' | 'taken';

export type AllianceCommandKind = 'alliance-offer' | 'alliance-withdraw' | 'alliance-accept' | 'alliance-break';

/** Factions' names as one phrase: "A", "A and B", "A, B and C". */
export function factionList(names: Readonly<Record<string, string>>, ids: readonly string[]) {
  const labels = ids.map((id) => names[id] ?? id);
  return labels.length < 2 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

function hasOffer(alliances: AllianceState | undefined, from: string | undefined, to: string | undefined) {
  return alliances?.offers.some((offer) => offer.from === from && offer.to === to) ?? false;
}

/** How the viewer stands with another faction; the viewer's own faction has no relation, as nothing is done about it. */
export function relationTo(alliances: AllianceState | undefined, own: string, factionId: string): Relation | null {
  const allies = alliesOf(alliances, own);
  if (factionId === own) {
    return null;
  }
  if (allies.includes(factionId)) {
    return 'ally';
  }
  /* A faction is in one alliance at a time, so while either side is allied there is nothing to offer or accept. */
  if (allies.length || alliesOf(alliances, factionId).length) {
    return 'taken';
  }
  if (hasOffer(alliances, factionId, own)) {
    return 'incoming';
  }
  return hasOffer(alliances, own, factionId) ? 'outgoing' : 'none';
}

/*
 * The command for one of the viewer's alliance actions about `factionId`.
 * Breaking names an ally the viewer saw, so a late click never leaves an alliance formed since; a withdrawal or an accept names the offer the viewer saw.
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
    return { kind, factionId };
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
  const allies = alliesOf(alliances, factionId);
  return allies.length ? `Allied with ${factionList(names, allies)}` : 'No alliance';
}
