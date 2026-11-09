import { playUiColors } from '@shared/uiPalette';
import { NameDisc } from '@ui/content/NameDisc';
import type { AriaRole, CSSProperties, Ref } from 'react';

/** A faction as its token shows it: its name, its token's face where it has one, and its colour. */
export type FactionToken = Readonly<{ id: string; name: string; src?: string | null; color?: string }>;

/**
 * A faction's token, ringed in its colour, or its initial where it has no face.
 * Any further props, a tooltip's handlers and ref among them, reach the token itself.
 */
export function FactionTokenFace({
  token,
  size,
  'aria-label': label,
  ...rest
}: Readonly<{
  token: FactionToken;
  size: number;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
  /** A token whose faction no text beside it names is an image named after it, so a reader hears who it is. */
  role?: AriaRole;
  'aria-label'?: string;
  /** A token beside text that already names its faction is hidden from readers, its initial included. */
  'aria-hidden'?: boolean;
}>) {
  return (
    <NameDisc
      {...rest}
      label={label}
      name={token.name}
      src={token.src}
      size={size}
      ring={token.color ?? playUiColors.annotationGold}
    />
  );
}
