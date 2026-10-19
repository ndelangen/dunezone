/** Names for Dune Zone features, separate from rulebook and code terminology. */
export const PRODUCT_TERMS = [
  {
    id: 'tint',
    term: 'Tint',
    topic: 'board',
    explanation:
      'A coloured highlight over a set of territories, with a transparent fill or just an outline. It can also add stickers. The Play table, Spice cards and Rulebook board scenes share the same tint definition.',
  },
  {
    id: 'sticker',
    term: 'Sticker',
    topic: 'board',
    explanation:
      'A small symbol that a tint places on its territories, such as a sietch or Shai-Hulud. The code still calls it a stamp. The interface and game log call it a sticker.',
  },
  {
    id: 'board-asset',
    term: 'Board',
    topic: 'board',
    explanation:
      'A saved round map made of named territories, each with a type and decals. The classic Arrakis board is one example.',
  },
  {
    id: 'table',
    term: 'Table',
    topic: 'play',
    explanation: 'The shared 3D table in a hosted game. It contains the board and the pieces players move.',
  },
  {
    id: 'seat',
    term: 'Seat',
    topic: 'play',
    explanation: 'A place reserved for one player at a station around the board rim.',
  },
  {
    id: 'spectator',
    term: 'Spectator',
    topic: 'play',
    explanation: 'Someone watching a game without a seat.',
  },
  {
    id: 'room',
    term: 'Room',
    topic: 'play',
    explanation: 'A hosted game with its own table, seats and game log.',
  },
  {
    id: 'stage',
    term: 'Stage',
    topic: 'play',
    explanation:
      'A step in the life of a hosted game. The stages are drafting, swapping, setup, play, finished and discarded. Phases are steps within play.',
  },
  {
    id: 'hidden-zone',
    term: 'Hidden zone',
    topic: 'play',
    explanation: "A faction's private area beside its hand. Other players see the pieces there face down.",
  },
  {
    id: 'game-log',
    term: 'Game log',
    topic: 'play',
    explanation: 'The public record of a game, with one sentence for each event.',
  },
  {
    id: 'decal',
    term: 'Decal',
    topic: 'artwork',
    explanation: 'A stock vector picture placed on a card or a territory, clipped to its shape.',
  },
  {
    id: 'edition',
    term: 'Edition',
    topic: 'artwork',
    explanation: 'A permanent published version of a Rulebook, with its own HTML page and PDF.',
  },
] as const;

export function productTermMatches(term: (typeof PRODUCT_TERMS)[number], query: string) {
  const needle = query.trim().toLowerCase();
  return !needle || term.term.toLowerCase().includes(needle) || term.explanation.toLowerCase().includes(needle);
}
