import { Avatar } from '@mantine/core';
import type { ComponentPropsWithoutRef, Ref } from 'react';

/* An initial reads at two fifths of the disc, but never smaller than this, so a small disc's initial stays legible. */
const MIN_INITIAL_PX = 9;

export interface NameDiscProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** Whose disc it is. Its first letter is the fallback when there is no picture, or the picture fails to load. */
  name: string;
  /** The picture: an avatar, a faction's token face. Absent or null shows the initial. */
  src?: string | null;
  /** The diameter, in pixels or as any CSS length (`2.6rem`, a custom property). */
  size: number | string;
  /** A one-pixel ring in this colour, for a faction's token. */
  ring?: string;
  /**
   * Names the disc for readers, for a disc with no name written beside it.
   * Without it the disc is decorative and hidden from readers, because the name already sits next to it.
   */
  label?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A person, faction, group or author as a round picture, or their initial in a circle where there is none.
 *
 * Content.
 * One shape for every disc on the site, so a seat, a chat line, a lobby row and a byline draw the same person the same way: one capital letter, sized to the disc, never two.
 * Any further props, a tooltip's handlers and ref among them, reach the disc itself.
 */
export function NameDisc({ name, src, size, ring, label, style, ref, ...rest }: NameDiscProps) {
  const length = typeof size === 'number' ? `${size}px` : size;
  return (
    <Avatar
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
      ref={ref}
      src={src || null}
      size={length}
      radius="50%"
      alt=""
      styles={{ placeholder: { fontSize: `max(${MIN_INITIAL_PX}px, calc(${length} * 0.4))`, fontWeight: 600 } }}
      style={{ ...(ring ? { border: `1px solid ${ring}` } : null), flexShrink: 0, ...style }}
    >
      {name.trim().slice(0, 1).toUpperCase()}
    </Avatar>
  );
}

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
