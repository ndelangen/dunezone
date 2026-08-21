import type { FC } from 'react';
import type { z } from 'zod';

import { StrokedUse } from '../../components/block/StrokedUse';
import type { RectangleTokenFace } from '../../data/objects';
import { BackgroundRenderer } from '../utils/BackgroundRenderer';
import { ELEMENT_SHADOW_FILTER } from './elementShadow';
import styles from './Rectangle.module.css';

/**
 * The face's own coordinate system, in the 300 unit convention `CustomToken` already uses.
 * Stored offsets and text sizes are expressed in these units, so the print size in `sizes.tokenRectangle` can double without restating a single authored number.
 */
const FACE_WIDTH = 300;
const FACE_HEIGHT = 186;

/** The reference box a decal at scale 1 fills, matching the 100 unit symbol box on the round shapes. */
const DECAL_REFERENCE = 100;

const FOREGROUND = '#ffffff';

/** A muted decal keeps its treatment from the shared `Decal` contract and multiplies with the author's own opacity. */
const MUTED_OPACITY = 0.35;

type Face = z.infer<typeof RectangleTokenFace>;

function DecalLayer({ decals }: { decals: Face['decals'] }) {
  return (
    <>
      {decals.map((decal, index) => {
        const size = DECAL_REFERENCE * decal.scale;
        return (
          <g
            key={index}
            opacity={decal.opacity * (decal.muted ? MUTED_OPACITY : 1)}
            style={decal.shadow ? { filter: ELEMENT_SHADOW_FILTER } : undefined}
          >
            <StrokedUse
              xlinkHref={`${decal.id}#root`}
              x={FACE_WIDTH / 2 - size / 2 + decal.offset[0]}
              y={FACE_HEIGHT / 2 - size / 2 + decal.offset[1]}
              width={size}
              height={size}
              fill={FOREGROUND}
              stroke={decal.outline ? '#000000' : undefined}
              strokeWidth={decal.outline ? 1.5 : undefined}
            />
          </g>
        );
      })}
    </>
  );
}

/**
 * Author-placed text.
 *
 * The font family is set inline rather than through a CSS class, which is a first for a renderer here.
 * It is deliberate: the author picks one of seven faces per element, so a class per element is a class per combination, and the family is data rather than styling.
 * A newline in `content` is significant and starts a new line at 1.05 of the cap height, which is why no field in the editor has to defend against one.
 */
function TextLayer({ texts }: { texts: Face['texts'] }) {
  return (
    <>
      {texts.map((text, index) => (
        <g
          key={index}
          fill={FOREGROUND}
          textAnchor="middle"
          opacity={text.opacity}
          /* As a style, not the SVG presentation attribute: the attribute's grammar takes url() references, and engines differ on whether CSS filter functions in it apply. */
          style={{ filter: 'drop-shadow(0 0 4px rgb(0 0 0 / 0.9))' }}
        >
          {text.content.split('\n').map((line, lineIndex) => (
            <text
              key={lineIndex}
              x={FACE_WIDTH / 2 + text.offset[0]}
              y={FACE_HEIGHT / 2 + text.offset[1] + lineIndex * text.size * 1.05}
              style={{ fontSize: text.size, fontFamily: `"${text.font}", sans-serif` }}
            >
              {line}
            </text>
          ))}
        </g>
      ))}
    </>
  );
}

/**
 * One face of a rectangle token.
 *
 * The rectangle is a free composition rather than a stretched token: a background, then two lists of elements the author placed and scaled where they wanted them.
 * Every other Asset type slots its content into fixed positions, which is why this shares only the background with `CustomToken` and none of its curved labels.
 */
export const RectangleToken: FC<Face> = ({ background, ring, ringShadow, decals, texts }) => {
  return (
    <BackgroundRenderer className={styles.face} background={background}>
      <svg className={styles.canvas} viewBox={`0 0 ${FACE_WIDTH} ${FACE_HEIGHT}`} aria-label="Rectangle token face">
        <DecalLayer decals={decals} />
        <TextLayer texts={texts} />
        {ring ? (
          <g style={ringShadow ? { filter: ELEMENT_SHADOW_FILTER } : undefined}>
            <rect
              x={8}
              y={8}
              width={FACE_WIDTH - 16}
              height={FACE_HEIGHT - 16}
              rx={10}
              fill="transparent"
              stroke={FOREGROUND}
              strokeWidth={1.3}
            />
          </g>
        ) : null}
      </svg>
    </BackgroundRenderer>
  );
};
