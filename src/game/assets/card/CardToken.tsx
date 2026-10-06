import type { CustomCardToken } from '@shared/assets/schema';
import { GEAR_CLIP } from '@shared/assets/tokenOutline';
import type { z } from 'zod';

import { CustomToken } from '../token/Custom';
import { RectangleToken } from '../token/Rectangle';

/** Clips the linked front to its token shape; the caller draws the shadow outside this clipping box. */
export function CardToken({ token }: { token: z.infer<typeof CustomCardToken> }) {
  const rectangle = token.type === 'token-enhance';
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        borderRadius: token.type === 'token-disc' ? '50%' : token.type === 'token-tech' ? undefined : 8,
        clipPath: token.type === 'token-tech' ? GEAR_CLIP : undefined,
      }}
    >
      {rectangle ? (
        <RectangleToken {...token.face} />
      ) : (
        <CustomToken
          background={token.face.background}
          image={token.face.image}
          circle={token.face.ring}
          circleShadow={token.face.ringShadow}
          top={token.face.top || undefined}
          bottom={
            token.face.bottomFirst || token.face.bottomSecond
              ? `${token.face.bottomFirst}\n${token.face.bottomSecond}`
              : undefined
          }
          size={{ width: 100 * token.face.symbolScale, height: 100 * token.face.symbolScale }}
        />
      )}
    </div>
  );
}
