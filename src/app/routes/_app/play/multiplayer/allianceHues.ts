import { allianceOf } from '@shared/play/alliances';
import type { GameSnapshot } from '@shared/play/protocol';

/*
 * Each alliance takes the hue of its mark; the same hue marks it in the rail, the panels and on the table.
 * Eighteen seats make at most nine alliances, and a new alliance takes the lowest free mark, so nine hues keep two alliances from ever sharing a colour.
 */
const HUES = [
  ['teal', '#20c997'],
  ['grape', '#cc5de8'],
  ['orange', '#ff922b'],
  ['lime', '#94d82d'],
  ['cyan', '#22b8cf'],
  ['pink', '#f06595'],
  ['violet', '#845ef7'],
  ['yellow', '#fcc419'],
  ['indigo', '#5c7cfa'],
] as const satisfies readonly (readonly [string, string])[];

/** The hue slot of the alliance `factionId` belongs to, or undefined when it stands alone. */
export function allianceSlot(snapshot: Pick<GameSnapshot, 'alliances'>, factionId: string | undefined) {
  return factionId ? allianceOf(snapshot.alliances, factionId)?.mark : undefined;
}

/** The alliance's colour as a hex value, for the table's materials and canvases. */
export function allianceColor(index: number): string {
  return HUES[index % HUES.length]![1];
}

/** The alliance's colour as the app theme names it, for page styles. */
export function allianceThemeColor(index: number): string {
  return `var(--mantine-color-${HUES[index % HUES.length]![0]}-5)`;
}
