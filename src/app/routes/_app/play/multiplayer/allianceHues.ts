import type { GameSnapshot } from '@shared/play/protocol';

/*
 * Each alliance takes one hue, by its place in the list; the same hue marks it in the rail, the panels and on the table.
 * Eighteen seats make at most nine alliances, so nine hues keep two alliances from ever sharing a colour.
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

/*
 * Each alliance prefers the hue of its lowest seat, taking the next free hue when another alliance holds that one.
 * Hues then follow the seats, not the alliances' order in the list, so an alliance keeps its colour while others form, grow or break.
 */
function hueSlots({ alliances, roster }: Pick<GameSnapshot, 'alliances' | 'roster'>): Map<string, number> {
  const position = new Map(roster?.seats.flatMap((seat) => (seat.faction ? [[seat.faction.id, seat.position]] : [])));
  const lowest = (group: readonly string[]) => Math.min(...group.map((id) => position.get(id) ?? Infinity));
  const groups = [...(alliances?.groups ?? [])].sort((left, right) => lowest(left) - lowest(right));
  const taken = new Set<number>();
  const slots = new Map<string, number>();
  for (const group of groups) {
    let slot = (Number.isFinite(lowest(group)) ? lowest(group) : 0) % HUES.length;
    while (taken.has(slot) && taken.size < HUES.length) {
      slot = (slot + 1) % HUES.length;
    }
    taken.add(slot);
    group.forEach((id) => slots.set(id, slot));
  }
  return slots;
}

/** The hue slot of the alliance `factionId` belongs to, or undefined when it stands alone. */
export function allianceSlot(snapshot: Pick<GameSnapshot, 'alliances' | 'roster'>, factionId: string | undefined) {
  return factionId ? hueSlots(snapshot).get(factionId) : undefined;
}

/** The alliance's colour as a hex value, for the table's materials and canvases. */
export function allianceColor(index: number): string {
  return HUES[index % HUES.length]![1];
}

/** The alliance's colour as the app theme names it, for page styles. */
export function allianceThemeColor(index: number): string {
  return `var(--mantine-color-${HUES[index % HUES.length]![0]}-5)`;
}
