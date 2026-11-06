import type { Board } from '@shared/boards/schema';

/* The spice-blow lesson's territories, by the ids the saved Arrakis gives them. */
const SPICE_BLOW = ['the_great_flat', 'funeral_plain', 'habbanya_erg'];

/**
 * The territories the glossary's tint lesson highlights on the saved board: every stronghold the board has, or the spice-blow territories it still has.
 * Nothing before the board arrives.
 */
export function tintLessonTerritories(board: Board | undefined, lesson: 'strongholds' | 'spice'): string[] {
  if (!board) {
    return [];
  }
  const territories = Object.values(board.properties);
  if (lesson === 'strongholds') {
    return territories.filter((territory) => territory.type === 'stronghold').map((territory) => territory.id);
  }
  const ids = new Set(territories.map((territory) => territory.id));
  return SPICE_BLOW.filter((id) => ids.has(id));
}
