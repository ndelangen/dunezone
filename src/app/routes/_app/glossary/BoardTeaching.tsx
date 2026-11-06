import type { ComponentGeometry } from '@shared/asset-publishing/componentGeometry';
import { useId, useMemo } from 'react';
import type { SVGProps } from 'react';

import { useArrakisFace } from '@app/db/arrakis';
import { RulebookBoardSceneVisual } from '@game/rulebook/RulebookBoardScene';

import { IDLE, SECTOR_DEGREES, demonstrationsFor, ringPoint, sectorPath, teachingParts } from './boardDemonstrations';
import type { Frame } from './boardDemonstrations';
import styles from './BoardTeaching.module.css';
import { useTeachingRun, useTeachingStep, useTeachingTerm } from './teaching';

function PartPaths({
  parts,
  partKey,
  ...props
}: { parts: ComponentGeometry['parts']; partKey: string } & SVGProps<SVGPathElement>) {
  const part = parts.find(({ key }) => key === partKey);
  return part?.highlight?.paths.map((path) => (
    <path
      key={path.d}
      d={path.d}
      transform={path.transform ? `matrix(${path.transform.join(' ')})` : undefined}
      {...props}
    />
  ));
}

/* The storm's wedge and marker, turned counterclockwise around the board's centre; the move between positions eases in and out. */
function Storm({ moves }: Readonly<{ moves: number }>) {
  return (
    <g className={styles.storm} style={{ transform: `rotate(${-moves * 3 * SECTOR_DEGREES}deg)` }}>
      <path d={sectorPath(0)} className={styles.stormWedge} />
      <g transform={`translate(${ringPoint(SECTOR_DEGREES / 2, 0.44)})`}>
        <circle r="0.03" className={styles.stormMarker} />
        <image href="/vector/icon/storrm_standalone.svg" x="-0.022" y="-0.022" width="0.044" height="0.044" />
      </g>
    </g>
  );
}

/*
 * What the demonstration lights is drawn above the board: the rest of the map darkens,
 * and each lit piece gets a bright fill and a light edge so it reads at a glance.
 */
function Spotlight({ frame, parts }: Readonly<{ frame: Frame; parts: ComponentGeometry['parts'] }>) {
  const strong = frame.lit.filter((lit) => !lit.faint);
  const mask = useId().replaceAll(':', '');
  return (
    <svg className={styles.overlay} viewBox="0 0 1 1" aria-hidden="true" data-blink={frame.blink || undefined}>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="1" height="1">
          <rect width="1" height="1" fill="white" />
          {strong.map((lit) => (
            <PartPaths key={lit.key} parts={parts} partKey={lit.key} fill="black" />
          ))}
        </mask>
      </defs>
      {strong.length > 0 && !frame.blink ? (
        <circle cx="0.5" cy="0.5" r="0.5" className={styles.shade} mask={`url(#${mask})`} />
      ) : null}
      {frame.lit.map((lit) => (
        <g key={lit.key} className={styles.lit} data-faint={lit.faint || undefined} style={{ color: lit.color }}>
          <PartPaths parts={parts} partKey={lit.key} />
        </g>
      ))}
      {frame.storm !== undefined ? <Storm moves={frame.storm} /> : null}
    </svg>
  );
}

/** The saved board of Arrakis, demonstrating whichever board term the reader is pointing at; an empty frame of its size while it loads. */
export function BoardTeaching() {
  const arrakis = useArrakisFace();
  if (!arrakis) {
    return <div className={styles.teaching} data-board-pending="" />;
  }
  return <BoardDemonstration boardId={arrakis.assetId} imageUrl={arrakis.imageUrl} geometry={arrakis.geometry} />;
}

function BoardDemonstration({
  boardId,
  imageUrl,
  geometry,
}: Readonly<{ boardId: string; imageUrl: string; geometry: ComponentGeometry }>) {
  const term = useTeachingTerm();
  const run = useTeachingRun();
  const demonstrations = useMemo(() => demonstrationsFor(geometry), [geometry]);
  const parts = useMemo(() => teachingParts(geometry), [geometry]);
  const demonstration = (term && demonstrations[term]) || IDLE;
  const step = useTeachingStep(demonstration !== IDLE, demonstration.steps, demonstration.interval);
  const frame = demonstration.frames(step, run);
  return (
    <div className={styles.teaching}>
      <RulebookBoardSceneVisual
        scene={{
          boardId,
          caption: '',
          size: 'fit-width',
          viewport: { x: 0, y: 0, width: 1, height: 1 },
          board: {
            status: 'ready',
            reference: { kind: 'board', boardId },
            name: 'The board of Arrakis, divided into sectors and territories',
            imageUrl,
            geometry,
          },
          players: [],
          troops: [],
          annotations: [],
          highlights: [],
          routes: frame.routes,
        }}
      />
      <Spotlight frame={frame} parts={parts} />
    </div>
  );
}
