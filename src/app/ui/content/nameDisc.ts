/**
 * A stable fill colour for an entity that has no image of its own, derived from its name.
 *
 * Groups carry no picture, so a citation of one had nothing to put in the circle that every other entity fills with a symbol, a cover or an avatar.
 * Hashing the name gives the same group the same colour on every screen and in every session, which is what makes the disc recognisable rather than decorative.
 *
 * Call it with the entity's display name and use the result as a CSS colour.
 * Saturation and lightness are fixed so the discs stay a family and stay legible on both themes;
 * only the hue moves.
 * Returns a `#rrggbb` string.
 */
export function nameDiscColor(name: string): string {
  let hash = 0;
  for (const character of name.trim().toLowerCase()) {
    hash = (Math.imul(hash, 31) + (character.codePointAt(0) ?? 0)) | 0;
  }
  return hslToHex(Math.abs(hash) % 360, 32, 38);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = l - chroma / 2;
  const [r, g, b] = sector(hue, chroma, second);
  const channel = (value: number) =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function sector(hue: number, chroma: number, second: number): [number, number, number] {
  switch (Math.floor(hue / 60) % 6) {
    case 0:
      return [chroma, second, 0];
    case 1:
      return [second, chroma, 0];
    case 2:
      return [0, chroma, second];
    case 3:
      return [0, second, chroma];
    case 4:
      return [second, 0, chroma];
    default:
      return [chroma, 0, second];
  }
}
