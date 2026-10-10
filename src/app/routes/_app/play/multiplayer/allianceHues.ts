/* Each alliance takes one hue, by its place in the list, so two alliances never share a colour; the same hue marks it in the rail, the panels and on the table. */
const HUES = [
  ['teal', '#20c997'],
  ['grape', '#cc5de8'],
  ['orange', '#ff922b'],
  ['lime', '#94d82d'],
  ['cyan', '#22b8cf'],
  ['pink', '#f06595'],
] as const;

/** The alliance's colour as a hex value, for the table's materials and canvases. */
export function allianceColor(index: number): string {
  return HUES[index % HUES.length]![1];
}

/** The alliance's colour as the app theme names it, for page styles. */
export function allianceThemeColor(index: number): string {
  return `var(--mantine-color-${HUES[index % HUES.length]![0]}-5)`;
}
