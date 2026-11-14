/** A Faction's name with its variant after it, wherever the two are one string: "House Atreides · Classic". */
export function nameWithVariant(name: string, variant: string | undefined): string {
  return variant === undefined ? name : `${name} · ${variant}`;
}
