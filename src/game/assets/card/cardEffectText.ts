/**
 * The words a storm, Nexus or homeworld card prints beyond what its author typed: the titles and conditions the template wraps around each rules region.
 *
 * Pure so the renderers and the asset page's text section read the same sentences, the way `spiceText.ts` serves both for a spice card.
 * Copying them into the page would let the indexed text drift from the face.
 */

/** One titled rules region, in the shape `CardEffects` draws. */
export type CardEffect = { title: string; condition?: string; text: string; strength?: number };

/** A storm card's printed instruction, built from its sector count. */
export function stormMovementText(sectors: number): string {
  return `Move the storm ${sectors} ${sectors === 1 ? 'sector' : 'sectors'} counter-clockwise.`;
}

/** A Nexus card's three regions, with the conditions its template prints for the named faction. */
export function nexusEffects({
  faction,
  betrayal,
  cunning,
  secretAlly,
}: {
  faction: string;
  betrayal: string;
  cunning: string;
  secretAlly: string;
}): [CardEffect, CardEffect, CardEffect] {
  const adjective = faction === 'Ixians' ? 'Ixian' : faction || 'faction';
  const article = /^[aeiou]/i.test(adjective) ? 'an' : 'a';
  const secretCondition = faction
    ? `If ${faction === 'CHOAM' ? '' : 'the '}${faction} ${faction === 'Emperor' ? 'is' : 'are'} not in the game`
    : 'If this faction is not in the game';
  return [
    { title: 'Betrayal', condition: `Cancel ${article} ${adjective} advantage`, text: betrayal },
    { title: 'Cunning', condition: `${faction || 'Faction'} Only`, text: cunning },
    { title: 'Secret Ally', condition: secretCondition, text: secretAlly },
  ];
}

type HomeworldReserve = { text: string; strength: number };

/** A homeworld's three states, each reserve with the force range its threshold sets and its strength. */
export function homeworldEffects({
  threshold,
  high,
  low,
  occupied,
}: {
  threshold: number;
  high: HomeworldReserve;
  low: HomeworldReserve;
  occupied: string;
}): [CardEffect, CardEffect, CardEffect] {
  return [
    { title: 'High reserves', condition: `${threshold} or more forces`, text: high.text, strength: high.strength },
    {
      title: 'Low reserves',
      condition: threshold === 1 ? '0 forces' : `0 to ${threshold - 1} forces`,
      text: low.text,
      strength: low.strength,
    },
    { title: 'Occupied', text: occupied },
  ];
}
