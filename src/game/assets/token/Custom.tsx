import { COMPONENT_GEOMETRY_PROTOCOL } from '@shared/asset-publishing/componentGeometry';
import { POINTER_TIP_RATIO } from '@shared/assets/tokenOutline';
import type { TokenShape } from '@shared/assets/tokenOutline';
import type { CSSProperties, FC } from 'react';
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
 * A pointer face is a circle with a point: the round end fills the bottom of the box and the point reaches the top edge, so the centre is the round end's.
 * It carries one symbol on that centre and its background is centred there too, with no labels: a point would cut an arc of text, and the plate reads as a marker rather than a badge (Norbert, 2026-10-15).
 * The published face stays the same square either way: the consumer cuts the shape, and this only decides where inside that square the parts land.
 */
type FaceGeometry = {
  centre: { x: number; y: number };
  /** The ring just inside the edge: a disc keeps its circle, and a pointer draws the teardrop as a path. */
  ring: { kind: 'circle'; r: number } | { kind: 'path'; d: string };
  /** The lines the labels follow, top then the two bottom arcs, or none when the shape carries no labels. */
  labels: { top: string; bottom: [string, string] } | null;
  /** The background's box, when it is not the renderer's own. */
  background: CSSProperties | undefined;
};

const ROUND: FaceGeometry = {
  centre: { x: 150, y: 150 },
  ring: { kind: 'circle', r: 138 },
  labels: {
    top: 'M 50 150 m 0 0 a 100 100 0 0 1 200 0',
    bottom: ['M 60 150 m 0 0 a 90 90 0 0 0 180 0', 'M 45 150 m 0 0 a 105 105 0 0 0 210 0'],
  },
  background: undefined,
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
  /*
   * The background is a square centred on the round end's centre, as it is on a disc's.
   * Its side is twice the centre's depth so it still reaches the point at the top; what hangs past the box's sides and bottom is clipped.
   */
  const side = (2 * centre.y * 100) / BOX;
  const background: CSSProperties = { width: `${side}%`, height: `${side}%`, left: `${(100 - side) / 2}%`, top: 0 };
  return { centre, ring: { kind: 'path', d: ring }, labels: null, background };
})();

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
    /** The outline the face will be cut to: a pointer centres one symbol and its background on the round end and carries no labels, every other shape draws the round face. */
    shape?: TokenShape;
  }
> = ({
  background,
  image,
  circle,
  circleShadow,
  top: topLabel,
  bottom: bottomLabel,
  size,
  fill,
  stroke,
  strokeWidth,
  shape,
}) => {
  const geometry = geometryOf(shape);
  const iconSize = { width: size?.width || 100, height: size?.width || 100 };
  const iconLocation = { x: geometry.centre.x - iconSize.width / 2, y: geometry.centre.y - iconSize.height / 2 };
  /* A shape without label lines draws none, whatever the face still stores. */
  const top = geometry.labels ? topLabel : undefined;
  const bottom = geometry.labels ? bottomLabel : undefined;
  return (
    <BackgroundRenderer className={styles.disc} background={background} overlayStyle={geometry.background}>
      <svg viewBox={`0 0 ${BOX} ${BOX}`} aria-label="Custom Token">
        <defs>
          {top && geometry.labels && <path id="top-text" d={geometry.labels.top} />}
          {bottom && geometry.labels && (
            <>
              <path id="bottom-text-1" d={geometry.labels.bottom[0]} />
              <path id="bottom-text-2" d={geometry.labels.bottom[1]} />
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
            <text className={styles.h1}>
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
