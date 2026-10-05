import type { RulebookAnnotationProjection } from '@shared/rulebooks/assetExplainerAnnotations';
import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';

import { Token } from '../assets/faction/token/Token';
import { RulebookAnnotationMarks } from './RulebookAnnotationMarks';
import { RulebookAssetExplainer } from './RulebookAssetExplainer';
import { RulebookTerritoryScene } from './RulebookTerritoryScene';
import { rulebookTroopArtwork } from './rulebookTroopArtwork';

type BoardBlock = Extract<RulebookRenderBlockV1, { kind: 'board-scene' }>;
export type RulebookBoardScene = Omit<BoardBlock, 'id' | 'anchor' | 'kind'>;
type Explainer = Extract<RulebookRenderBlockV1, { kind: 'asset-explainer' }>;

type TableGeometry = Readonly<{ width: number; height: number; radius: number }>;

function pointOnRing(geometry: TableGeometry, angle: number, distance = geometry.radius) {
  return {
    x: geometry.width / 2 + distance * Math.cos((angle * Math.PI) / 180),
    y: geometry.height / 2 - distance * Math.sin((angle * Math.PI) / 180),
  };
}

function StormSector({ angle, geometry }: Readonly<{ angle: number; geometry: TableGeometry }>) {
  const { width, height, radius } = geometry;
  const stormRadius = radius * 0.895;
  const first = pointOnRing(geometry, angle - 10, stormRadius);
  const last = pointOnRing(geometry, angle + 10, stormRadius);
  const position = pointOnRing(geometry, angle, stormRadius);
  return (
    <>
      <path
        d={`M ${width / 2} ${height / 2} L ${first.x} ${first.y} A ${stormRadius} ${stormRadius} 0 0 0 ${last.x} ${last.y} Z`}
        fill="#8b3628"
        fillOpacity=".27"
        stroke="#8b3628"
        strokeWidth={width * 0.003}
      />
      <g transform={`translate(${position.x} ${position.y})`} aria-label="Storm">
        <circle r={width * 0.0308} fill="#8b3628" stroke="#fff9eb" strokeWidth={width * 0.004} />
        <text textAnchor="middle" dy={width * 0.0072} fontSize={width * 0.0185} fontWeight="bold" fill="#fff9eb">
          STORM
        </text>
      </g>
    </>
  );
}

function StormDirection({
  angle,
  players,
  geometry,
}: Readonly<{ angle: number; players: RulebookBoardScene['players']; geometry: TableGeometry }>) {
  const nextDistance = Math.min(...players.map((player) => (player.angle - angle + 720) % 360));
  if (!Number.isFinite(nextDistance) || nextDistance <= 23) {
    return null;
  }
  const { width, radius } = geometry;
  const start = pointOnRing(geometry, angle + 13);
  const end = pointOnRing(geometry, angle + nextDistance - 10);
  return (
    <g className="rulebookStormDirection">
      <path d={`M ${start.x} ${start.y} A ${radius} ${radius} 0 ${nextDistance > 203 ? 1 : 0} 0 ${end.x} ${end.y}`} />
      <path
        transform={`translate(${end.x} ${end.y}) rotate(${-(angle + nextDistance - 10)})`}
        d={`M ${width * 0.02} ${width * 0.012} L 0 0 L ${-width * 0.014} ${width * 0.018}`}
      />
    </g>
  );
}

function PlayerMarkers({
  players,
  geometry,
}: Readonly<{ players: RulebookBoardScene['players']; geometry: TableGeometry }>) {
  const markerSize = geometry.width * 0.0657;
  return players.map((player) => {
    const position = pointOnRing(geometry, player.angle);
    const faction = player.faction.status === 'ready' ? player.faction : undefined;
    return (
      <foreignObject
        key={player.id}
        x={position.x - markerSize / 2}
        y={position.y - markerSize / 2}
        width={markerSize}
        height={markerSize}
      >
        <div className="rulebookTerritoryTroop" aria-label={`${faction?.name ?? 'Unavailable faction'} player marker`}>
          {faction?.token ? <Token {...faction.token} /> : <span className="rulebookTerritoryMissingTroop">?</span>}
        </div>
      </foreignObject>
    );
  });
}

function BoardAnnotations({
  annotations,
  projection,
}: Readonly<{ annotations: RulebookBoardScene['annotations']; projection: RulebookAnnotationProjection }>) {
  return (
    <RulebookAnnotationMarks
      projection={{
        ...projection,
        entries: projection.entries.map((entry, index) => {
          const annotation = annotations[index]!;
          return {
            ...entry,
            marker: { x: annotation.x, y: annotation.y },
            connector:
              annotation.targetX !== undefined && annotation.targetY !== undefined
                ? { x: annotation.targetX, y: annotation.targetY }
                : undefined,
          };
        }),
      }}
    />
  );
}

function TableOverlay({
  scene,
  width,
  height,
  projection,
}: Readonly<{ scene: RulebookBoardScene; width: number; height: number; projection?: RulebookAnnotationProjection }>) {
  const geometry = { width, height, radius: Math.min(width, height) * 0.475 };
  return (
    <>
      {scene.storm ? (
        <>
          <StormSector angle={scene.storm.angle} geometry={geometry} />
          <StormDirection angle={scene.storm.angle} players={scene.players} geometry={geometry} />
        </>
      ) : null}
      <PlayerMarkers players={scene.players} geometry={geometry} />
      {projection ? <BoardAnnotations annotations={scene.annotations} projection={projection} /> : null}
    </>
  );
}

/** A board scene keeps markers, troops, and annotations tied to the supplied board geometry. */
export function RulebookBoardSceneVisual({ scene }: Readonly<{ scene: RulebookBoardScene }>) {
  const source = scene.board;
  if (source.status !== 'ready' || !source.geometry) {
    return (
      <div className="rulebookBoardUnavailable">
        <p>Board unavailable</p>
        {scene.caption ? <p>{scene.caption}</p> : null}
        {scene.annotations.length ? (
          <ol aria-label="Explanations">
            {scene.annotations.map((annotation) => (
              <li key={annotation.id}>
                <h3>{annotation.title}</h3>
                <p>{annotation.text}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    );
  }
  const geometry = source.geometry;
  const viewport = scene.viewport ?? { x: -0.03, y: -0.03, width: 1.06, height: 1.06 };
  const draw = (projection?: RulebookAnnotationProjection) => (
    <RulebookTerritoryScene
      board={{ imageUrl: source.imageUrl, geometry }}
      label={source.name}
      size={scene.annotations.length ? 'large' : 'compact'}
      viewport={{
        x: viewport.x * geometry.width,
        y: viewport.y * geometry.height,
        width: viewport.width * geometry.width,
        height: viewport.height * geometry.height,
      }}
      highlights={scene.highlights}
      troops={scene.troops.map((troop) => ({
        ...troop,
        artwork: rulebookTroopArtwork(troop),
        x: troop.x * geometry.width,
        y: troop.y * geometry.height,
        size: troop.size * geometry.width,
        gap: troop.gap * geometry.width,
      }))}
      labels={[]}
      overlay={<TableOverlay scene={scene} width={geometry.width} height={geometry.height} projection={projection} />}
    />
  );
  if (!scene.annotations.length) {
    return (
      <figure className="rulebookBoardPlain">
        {draw()}
        {scene.caption ? <figcaption>{scene.caption}</figcaption> : null}
      </figure>
    );
  }
  const reference = source.reference;
  const block: Explainer = {
    id: 'board-legend',
    kind: 'asset-explainer',
    numbering: 'automatic',
    colorMode: 'manual',
    caption: scene.caption,
    source: {
      ...source,
      geometry: {
        ...geometry,
        parts: scene.annotations.map((annotation, index) => ({
          key: `scene-annotation-${index}`,
          label: annotation.title,
          x: Math.min(annotation.x, 0.999),
          y: Math.min(annotation.y, 0.999),
          width: 0.001,
          height: 0.001,
        })),
      },
    },
    items: scene.annotations.map((annotation, index) => ({
      id: annotation.id,
      label: String(index + 1),
      color: annotation.color,
      text: annotation.text,
      target: { kind: 'named', key: `scene-annotation-${index}`, source: reference },
    })),
  };
  return (
    <div className="rulebookBoardAnnotated">
      <RulebookAssetExplainer block={block} embedded renderIllustration={draw} />
    </div>
  );
}

/** Saved board scenes carry their own block identity; the nested legend shares that identity. */
export function RulebookBoardSceneBlock({ block }: Readonly<{ block: BoardBlock }>) {
  return (
    <section id={block.anchor} data-rulebook-block-anchor={block.anchor} data-rulebook-block-id={block.id}>
      <RulebookBoardSceneVisual scene={block} />
    </section>
  );
}
