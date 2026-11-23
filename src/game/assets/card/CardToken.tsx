import type { CustomCardToken } from '@shared/assets/schema';
import { tokenOutline, tokenShapeOfType } from '@shared/assets/tokenOutline';
import type { z } from 'zod';

import { LeaderToken } from '../faction/leader/Leader';
import { CustomToken } from '../token/Custom';
import { RectangleToken } from '../token/Rectangle';
import { tokenFaceProps } from '../token/tokenFace';

/** Clips the linked front to its token shape; the caller draws the shadow outside this clipping box. */
export function CardToken({ token }: { token: z.infer<typeof CustomCardToken> }) {
  if (token.type === 'token-leader') {
    /* A leader token is a disc that draws its own round edge. */
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: '50%' }}>
        <LeaderToken {...token.leader} />
      </div>
    );
  }
  const rectangle = token.type === 'token-enhance';
  const shape = tokenShapeOfType(token.type);
  const { clipPath } = tokenOutline(shape ?? 'square');
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        borderRadius: token.type === 'token-disc' ? '50%' : clipPath ? undefined : 8,
        clipPath,
      }}
    >
      {rectangle ? (
        <RectangleToken {...token.face} />
      ) : (
        <CustomToken shape={shape ?? 'round'} {...tokenFaceProps(token.face)} />
      )}
    </div>
  );
}
