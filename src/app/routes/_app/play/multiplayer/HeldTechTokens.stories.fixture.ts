import type { GameSnapshot } from '@shared/play/protocol';
import { heldTechTokens } from '@shared/play/techToken';

import { dreamrulesTechTokenPieces } from '../panels/inventory/techTokens.stories.fixture';
import { heldTechTokenPieces as piecesOf } from './heldTechTokenPiece';

/* The Dreamrules tech tokens a story hands out, by slug. */
function tokens(...slugs: string[]) {
  const pieces = dreamrulesTechTokenPieces();
  return slugs.map((slug) => pieces.find((piece) => piece.id === `dreamrules-tech-${slug}`)!);
}

/** The tech tokens each seat holds in the story, as the Worker sends them: seat 1 two face up, the viewer's seat 2 one. */
export function withTechTokens(snapshot: GameSnapshot, holdings = HOLDINGS): GameSnapshot {
  const factionOf = (seat: string) => snapshot.roster!.seats.find((entry) => entry.id === seat)!.faction!.id;
  const inventories = Object.fromEntries(
    Object.entries(holdings).map(([seat, slugs]) => [factionOf(seat), tokens(...slugs)])
  );
  return { ...snapshot, techTokens: heldTechTokens(inventories, Object.keys(inventories)) };
}

const HOLDINGS: Readonly<Record<string, string[]>> = {
  'seat-1': ['heighliners', 'spice-production'],
  'seat-2': ['customs'],
};

/** Held tech tokens as the Faction info shows them, from the Dreamrules art; a face-down one shows its back only. */
export function heldTechTokenPieces(slugs: readonly string[], { faceDown = [] as readonly string[] } = {}) {
  const held = heldTechTokens(
    {
      house: tokens(...slugs).map((piece) => ({
        ...piece,
        items: piece.items.map((item) => ({
          ...item,
          faceUp: !faceDown.includes(piece.id.replace('dreamrules-tech-', '')),
        })),
      })),
    },
    ['house']
  );
  return piecesOf(held.house ?? [], 'house');
}
