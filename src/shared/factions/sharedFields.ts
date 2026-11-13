type SharedFieldName = 'name' | 'emblem' | 'background' | 'themeColor' | 'colors';

/** A faction's data split into what its Faction shares with every variant and what belongs to the variant alone (#2905). */
export function splitSharedFields<Data extends Record<SharedFieldName, unknown>>(data: Data) {
  const { name, emblem, background, themeColor, colors, ...variant } = data;
  const shared: Pick<Data, SharedFieldName> = { name, emblem, background, themeColor, colors };
  return { shared, variant: variant as Omit<Data, SharedFieldName> };
}
