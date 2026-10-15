import { COMPONENT_GEOMETRY_PROTOCOL } from '@shared/asset-publishing/componentGeometry';
import { POINTER_TIP_RATIO } from '@shared/assets/tokenOutline';
import type { TokenShape } from '@shared/assets/tokenOutline';
import type { FC } from 'react';
import type { z } from 'zod';

import type { FactionSide } from '../../data/objects';
import { BackgroundRenderer } from '../utils/BackgroundRenderer';
import { StrokedUse } from '../utils/StrokedUse';
import styles from './Custom.module.css';
import { ELEMENT_SHADOW_FILTER } from './elementShadow';

const foreGroundColor = '#ffffff';

/** The renderer's box: every part below is placed in these units, and the face fills whatever it is given. */
const BOX = 300;

/**
 * Where a face's parts sit, per shape.
 *
 * A round face centres everything on the box and curves its labels along the rim.
 * A pointer face is a teardrop with its point at the top of the box, so its centre is the round end's, its top label runs straight across the neck between the point and the symbol, and its ring follows the teardrop rather than a circle the point would cut.
 * The published face stays the same square either way: the consumer cuts the shape, and this only decides where inside that square the parts land.
 */
type FaceGeometry = {
  centre: { x: number; y: number };
  /** The ring just inside the edge: a disc keeps its circle, and a pointer draws the teardrop as a path. */
  ring: { kind: 'circle'; r: number } | { kind: 'path'; d: string };
  /** The line the top label follows: an arc over a round face, a straight run across a pointer's neck. */
  top: string;
  /** How much of a label the top path can take before the label has to be fitted to it; unbounded on an arc, which is long enough for any label. */
  topLength: number | null;
  /** The two arcs under the symbol, inner first. */
  bottom: [string, string];
};

const ROUND: FaceGeometry = {
  centre: { x: 150, y: 150 },
  ring: { kind: 'circle', r: 138 },
  top: 'M 50 150 m 0 0 a 100 100 0 0 1 200 0',
  topLength: null,
  bottom: ['M 60 150 m 0 0 a 90 90 0 0 0 180 0', 'M 45 150 m 0 0 a 105 105 0 0 0 210 0'],
};

const POINTER: FaceGeometry = (() => {
  /* The teardrop spans the box top to bottom: the point on the top edge, the round end touching the bottom edge. */
  const radius = BOX / (1 + POINTER_TIP_RATIO);
  const centre = { x: BOX / 2, y: BOX - radius };
  /* The ring is the teardrop shrunk about the round end's centre, which keeps its straight edges parallel to the outline's, the same inset a disc's ring keeps from its edge. */
  const inset = 138 / 150;
  const ringRadius = radius * inset;
  const ringTip = centre.y - ringRadius * POINTER_TIP_RATIO;
  const tangent = Math.acos(1 / POINTER_TIP_RATIO);
  const tangentX = ringRadius * Math.sin(tangent);
  const tangentY = centre.y - ringRadius * Math.cos(tangent);
  const ring = [
    `M ${centre.x} ${ringTip}`,
    `L ${centre.x + tangentX} ${tangentY}`,
    `A ${ringRadius} ${ringRadius} 0 1 1 ${centre.x - tangentX} ${tangentY}`,
    'Z',
  ].join(' ');
  /* The top label sits in the neck, above the symbol and well below the point, where the teardrop is wide enough to hold a short word. */
  const topY = centre.y * 0.53;
  const topHalfWidth = (tangentX * (topY - ringTip)) / (tangentY - ringTip) - 6;
  const top = `M ${centre.x - topHalfWidth} ${topY} L ${centre.x + topHalfWidth} ${topY}`;
  /* The bottom lines curve under the symbol a little further out than a disc's take of its own radius, because the symbol's reference size is a larger share of the round end. */
  const arc = (share: number) => {
    const r = radius * share;
    return `M ${centre.x - r} ${centre.y} a ${r} ${r} 0 0 0 ${2 * r} 0`;
  };
  return { centre, ring: { kind: 'path', d: ring }, top, topLength: topHalfWidth * 2, bottom: [arc(0.64), arc(0.75)] };
})();

/** Copperplate's capitals run wide: this many ems per letter is a safe estimate of a label's length before it is measured. */
const TOP_LABEL_ADVANCE = 0.8;
const TOP_LABEL_FONT_SIZE = 28;

function geometryOf(shape: TokenShape | undefined): FaceGeometry {
  return shape === 'pointer' ? POINTER : ROUND;
}

/** One pass of the ring; the two glow passes draw it twice. */
function Ring({ ring }: { ring: FaceGeometry['ring'] }) {
  const paint = { fill: 'transparent', id: 'mainCircle', stroke: foreGroundColor, strokeWidth: 1.3 };
  return ring.kind === 'circle' ? (
    <circle cx={ROUND.centre.x} cy={ROUND.centre.y} r={ring.r} {...paint} />
  ) : (
    <path d={ring.d} {...paint} />
  );
}

export const CustomToken: FC<
  z.infer<typeof FactionSide> & {
    circle: boolean;
    /** The author-chosen elevation under the ring; the two built-in glow passes stay either way. */
    circleShadow?: boolean;
    top?: string;
    bottom?: string;
    size?: { width: number; height: number };
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    /** The outline the face will be cut to: a pointer lays its parts out for the teardrop, every other shape for the round face. */
    shape?: TokenShape;
  }
> = ({ background, image, circle, circleShadow, top, bottom, size, fill, stroke, strokeWidth, shape }) => {
  const geometry = geometryOf(shape);
  const iconSize = { width: size?.width || 100, height: size?.width || 100 };
  const iconLocation = { x: geometry.centre.x - iconSize.width / 2, y: geometry.centre.y - iconSize.height / 2 };
  /* A label longer than a straight top path is squeezed to the path rather than cut off at its end, which is what a text path does with the glyphs it has no room for. */
  const topLength =
    top && geometry.topLength !== null && top.length * TOP_LABEL_ADVANCE * TOP_LABEL_FONT_SIZE > geometry.topLength
      ? geometry.topLength
      : undefined;
  return (
    <BackgroundRenderer className={styles.disc} background={background}>
      <svg viewBox={`0 0 ${BOX} ${BOX}`} aria-label="Custom Token">
        <defs>
          {top && <path id="top-text" d={geometry.top} />}
          {bottom && (
            <>
              <path id="bottom-text-1" d={geometry.bottom[0]} />
              <path id="bottom-text-2" d={geometry.bottom[1]} />
            </>
          )}
        </defs>

        <g
          {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: 'symbol' }}
          filter="drop-shadow( 0 0 9px rgba(0, 0, 0, 0.6))"
        >
          <StrokedUse
            xlinkHref={`${image}#root`}
            {...iconLocation}
            {...iconSize}
            fill={fill || foreGroundColor}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </g>
        <g filter="drop-shadow( 0 0 24px rgba(0, 0, 0, 0.6))">
          <StrokedUse
            xlinkHref={`${image}#root`}
            {...iconLocation}
            {...iconSize}
            fill={fill || foreGroundColor}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </g>
        {circle && (
          <g
            {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: 'ring' }}
            style={circleShadow ? { filter: ELEMENT_SHADOW_FILTER } : undefined}
          >
            <g filter="drop-shadow( 0 0 9px rgba(0, 0, 0, 0.8))">
              <Ring ring={geometry.ring} />
            </g>
            <g filter="drop-shadow( 0 0 24px rgba(0, 0, 0, 0.8))">
              <Ring ring={geometry.ring} />
            </g>
          </g>
        )}

        {top && (
          <g
            {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: top.trim() ? 'top-text' : undefined }}
            filter="drop-shadow(0 0 5px rgb(0 0 0 / 1))"
          >
            <text className={styles.h1} textLength={topLength} lengthAdjust="spacingAndGlyphs">
              <textPath startOffset="50%" dominantBaseline="middle" textAnchor="middle" xlinkHref="#top-text">
                {top}
              </textPath>
            </text>
          </g>
        )}
        {bottom && (
          <g
            {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: bottom.trim() ? 'bottom-text' : undefined }}
            filter="drop-shadow(0 0 5px rgb(0 0 0 / 1))"
          >
            <text className={styles.h2}>
              <textPath startOffset="50%" dominantBaseline="middle" textAnchor="middle" xlinkHref="#bottom-text-1">
                {bottom.split('\n')[0]}
              </textPath>
            </text>
            <text className={styles.h2}>
              <textPath startOffset="50%" dominantBaseline="middle" textAnchor="middle" xlinkHref="#bottom-text-2">
                {bottom.split('\n')[1]}
              </textPath>
            </text>
          </g>
        )}
      </svg>
    </BackgroundRenderer>
  );
};
