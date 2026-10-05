import type { ComponentGeometry } from '@shared/asset-publishing/componentGeometry';
import type { RulebookAnnotationProjection } from '@shared/rulebooks/assetExplainerAnnotations';
import { projectRulebookBoardRoutes } from '@shared/rulebooks/boardRoutes';
import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';
import { useId } from 'react';

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

function StormSector({
  angle,
  geometry,
  shelteredArea,
}: Readonly<{
  angle: number;
  geometry: TableGeometry;
  shelteredArea?: ComponentGeometry['parts'][number]['highlight'];
}>) {
  const shelterMask = useId().replaceAll(':', '');
  const { width, height } = geometry;
  const stormRadius = Math.min(width, height) / 2;
  const first = pointOnRing(geometry, angle - 10, stormRadius);
  const last = pointOnRing(geometry, angle + 10, stormRadius);
  const position = pointOnRing(geometry, angle, stormRadius * 0.9);
  const iconSize = width * 0.045;
  return (
    <>
      {shelteredArea ? (
        <defs>
          <mask id={shelterMask} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <rect width={width} height={height} fill="white" />
            <g transform={`scale(${width} ${height})`}>
              {shelteredArea.paths.map((path, index) => (
                <path
                  key={index}
                  d={path.d}
                  transform={path.transform ? `matrix(${path.transform.join(' ')})` : undefined}
                  fill="black"
                />
              ))}
            </g>
          </mask>
        </defs>
      ) : null}
      <path
        mask={shelteredArea ? `url(#${shelterMask})` : undefined}
        d={`M ${width / 2} ${height / 2} L ${first.x} ${first.y} A ${stormRadius} ${stormRadius} 0 0 0 ${last.x} ${last.y} Z`}
        fill="#8b3628"
        fillOpacity=".27"
        stroke="#8b3628"
        strokeWidth={width * 0.003}
      />
      <g transform={`translate(${position.x} ${position.y})`} aria-label="Storm">
        <circle r={width * 0.0308} fill="#fff9eb" stroke="#8b3628" strokeWidth={width * 0.004} />
        <image
          href="/vector/icon/storrm_standalone.svg"
          x={-iconSize / 2}
          y={-iconSize / 2}
          width={iconSize}
          height={iconSize}
        />
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

function BoardRoutes({ scene, width, height }: Readonly<{ scene: RulebookBoardScene; width: number; height: number }>) {
  const markerPrefix = useId().replaceAll(':', '');
  const geometry = scene.board.status === 'ready' ? scene.board.geometry : undefined;
  return projectRulebookBoardRoutes(scene.routes, geometry).map((route, routeIndex) => {
    const points = route.points.map((point) =>
      point ? { ...point, x: point.x * width, y: point.y * height } : undefined
    );
    const color = route.color ?? '#215f89';
    const markerId = `${markerPrefix}-route-${routeIndex}`;
    return (
      <g key={route.id} data-rulebook-route={route.id}>
        <title>{route.label}</title>
        <defs>
          {[false, true].map((outline) => (
            <marker
              key={String(outline)}
              id={outline ? `${markerId}-outline` : markerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth={width * 0.024}
              markerHeight={width * 0.024}
              orient="auto-start-reverse"
              overflow="visible"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 Z"
                fill={outline ? '#fff9eb' : color}
                stroke={outline ? '#fff9eb' : undefined}
                strokeWidth={outline ? 2.5 : undefined}
                strokeLinejoin="round"
              />
            </marker>
          ))}
        </defs>
        {points.slice(0, -1).map((from, index) => {
          const to = points[index + 1];
          if (!from || !to) {
            return null;
          }
          const blocked = route.blockedAfter === index;
          const distance = Math.hypot(to.x - from.x, to.y - from.y);
          const inset = Math.min(width * 0.023, distance / 3);
          const dx = distance ? ((to.x - from.x) / distance) * inset : 0;
          const dy = distance ? ((to.y - from.y) / distance) * inset : 0;
          const d = `M ${from.x + dx} ${from.y + dy} L ${to.x - dx} ${to.y - dy}`;
          const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
          return (
            <g key={index} data-route-segment={index} data-blocked={blocked || undefined}>
              <path
                d={d}
                fill="none"
                stroke="#fff9eb"
                strokeWidth={width * 0.012}
                strokeLinecap="round"
                markerEnd={route.direction !== 'none' ? `url(#${markerId}-outline)` : undefined}
                markerStart={route.direction === 'both' ? `url(#${markerId}-outline)` : undefined}
              />
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={width * 0.006}
                strokeDasharray={blocked ? `${width * 0.014} ${width * 0.012}` : undefined}
                markerEnd={route.direction !== 'none' ? `url(#${markerId})` : undefined}
                markerStart={route.direction === 'both' ? `url(#${markerId})` : undefined}
              />
              {blocked ? (
                <g aria-label="Blocked segment" transform={`translate(${midpoint.x} ${midpoint.y})`}>
                  <circle r={width * 0.023} fill="#fff9eb" stroke="#a22c20" strokeWidth={width * 0.004} />
                  <path
                    d={`M ${-width * 0.012} ${-width * 0.012} L ${width * 0.012} ${width * 0.012} M ${-width * 0.012} ${width * 0.012} L ${width * 0.012} ${-width * 0.012}`}
                    stroke="#a22c20"
                    strokeWidth={width * 0.005}
                  />
                </g>
              ) : null}
            </g>
          );
        })}
        {points.map((point, index) =>
          point?.label !== undefined ? (
            <g key={index} transform={`translate(${point.x} ${point.y})`}>
              <circle r={width * 0.018} fill={color} stroke="#fff9eb" strokeWidth={width * 0.003} />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill="#fff9eb"
                fontWeight="bold"
                fontSize={width * 0.024}
              >
                {point.label}
              </text>
            </g>
          ) : null
        )}
      </g>
    );
  });
}

function RouteLegend({ scene }: Readonly<{ scene: RulebookBoardScene }>) {
  const geometry = scene.board.status === 'ready' ? scene.board.geometry : undefined;
  return scene.routes?.length ? (
    <ul className="rulebookRouteLegend" aria-label="Routes">
      {projectRulebookBoardRoutes(scene.routes, geometry).map((route) => (
        <li key={route.id}>
          <span className="rulebookRouteKey" style={{ backgroundColor: route.color ?? '#215f89' }} aria-hidden="true" />
          <span>
            <strong>{route.label}</strong>
            {route.legendLabel.slice(route.label.length)}
          </span>
        </li>
      ))}
    </ul>
  ) : null;
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
          <StormSector
            angle={scene.storm.angle}
            geometry={geometry}
            shelteredArea={
              scene.board.status === 'ready'
                ? scene.board.geometry?.parts.find((part) => part.key === 'polar')?.highlight
                : undefined
            }
          />
          <StormDirection angle={scene.storm.angle} players={scene.players} geometry={geometry} />
        </>
      ) : null}
      <BoardRoutes scene={scene} width={width} height={height} />
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
        <RouteLegend scene={scene} />
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
      size={scene.size ?? (scene.annotations.length ? 'large' : 'compact')}
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
        <RouteLegend scene={scene} />
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
      <RouteLegend scene={scene} />
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
