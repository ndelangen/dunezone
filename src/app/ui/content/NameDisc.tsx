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
