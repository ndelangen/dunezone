import type { TokenFace } from '@shared/assets/schema';
import type { ComponentProps } from 'react';
import type { z } from 'zod';

import type { CustomToken } from './Custom';

/** The same stored face reaches previews, embedded tokens and publication without losing symbol styling. */
export function tokenFaceProps(face: z.infer<typeof TokenFace>): ComponentProps<typeof CustomToken> {
  return {
    background: face.background,
    image: face.image,
    circle: face.ring,
    circleShadow: face.ringShadow ?? false,
    fill: face.symbolFill,
    stroke: face.symbolStroke,
    strokeWidth: face.symbolStrokeWidth,
    symbolShadow: face.symbolShadow,
    top: face.top || undefined,
    bottom: face.bottomFirst || face.bottomSecond ? `${face.bottomFirst}\n${face.bottomSecond}` : undefined,
    size: { width: 100 * face.symbolScale, height: 100 * face.symbolScale },
  };
}
