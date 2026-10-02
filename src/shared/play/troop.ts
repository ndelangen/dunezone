import type { TablePiece } from './model';

type TroopIdentity = Pick<TablePiece, 'kind'> & Partial<Pick<TablePiece, 'stackKey'>>;

/*
 * The 'force' kind also covers leader discs and catalogue tokens such as the Harvester, so the stack key decides what is a troop.
 * A supplied reserve keys on `troops:`; the demo table keeps the stored `forces:` key (Dune Zone says troop, see the glossary).
 */
const TROOP_STACK_KEY = /^(troops|forces):/;

export function isTroopStack(piece: TroopIdentity): boolean {
  return piece.kind === 'force' && TROOP_STACK_KEY.test(piece.stackKey ?? '');
}
