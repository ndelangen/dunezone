import { tokenOutline, tokenShapeAspect } from '@shared/assets/tokenOutline';
import type { TokenShape } from '@shared/assets/tokenOutline';

import { PublishedImage } from './PublishedImage';

/**
 * One published token face, cut to its shape.
 *
 * Content: the one way the app shows a token's image, whatever the token.
 * The publication is an opaque square (a rectangle for an enhance token), so the shape comes from here, never from the file: a disc is round, a tech token a gear, a plate and an enhance token have rounded corners.
 * It fills the width it is given, so callers size it by sizing its parent.
 */
export function TokenImage({
  src,
  name,
  shape,
  raised = false,
}: Readonly<{
  /** The publication, or null when there is none, which draws the missing state. */
  src: string | null;
  name: string;
  shape: TokenShape;
  /** Whether it wears a raised shadow. A gear never does, since its clip would cut the shadow away. */
  raised?: boolean;
}>) {
  return (
    <PublishedImage
      src={src}
      name={name}
      aspect={tokenShapeAspect(shape)}
      raised={raised && tokenOutline(shape).clipPath === undefined}
      {...tokenOutline(shape)}
    />
  );
}
