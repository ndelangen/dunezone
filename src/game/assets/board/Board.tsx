import { derive, defaults, contourPath, edgePath, referenceSectors } from '@shared/boards/geometry';
import type { Board, Decal, Face } from '@shared/boards/geometry';
import { useId } from 'react';

import { BOARD_ARTWORK } from './artwork';
const baseColors = { sand: '#F6D979', rock: '#A67A3E', stronghold: '#F7BA7A', polar: '#fff' };
const decorationColors = { sand: '#A67A3E', rock: '#67371C', stronghold: '#67371C', polar: '#888' };
export function DecalArtwork({ decal, svg }: { decal: Decal; svg?: string }) {
  const outlineId = useId().replaceAll(':', '');
  const viewBox = svg?.match(/viewBox="([^"]+)"/)?.[1] || '0 0 100 100';
  const source = (svg || '')
    .replace(/\bid="([^"]+)"/g, (_, id: string) => `id="${outlineId}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#${outlineId}-${id})`)
    .replace(/(href=")#([^"]+)/g, (_, attr: string, id: string) => `${attr}#${outlineId}-${id}`);
  const inner = source
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '')
    .replace(/<path[^>]*data-decal-outline[^>]*\/>/g, (path) => (decal.outline ? path : ''));
  return (
    <g transform={`translate(${decal.x} ${decal.y}) rotate(${decal.rotation})`}>
      {decal.outline && !svg?.includes('data-decal-outline') && (
        <defs>
          <filter id={outlineId} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="1.4" result="expanded" />
            <feFlood floodColor="#fff" result="white" />
            <feComposite in="white" in2="expanded" operator="in" result="outline" />
            <feMerge>
              <feMergeNode in="outline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      <g filter={decal.outline && !svg?.includes('data-decal-outline') ? `url(#${outlineId})` : undefined}>
        {svg ? (
          <svg
            x={-decal.scale / 2}
            y={-decal.scale / 2}
            width={decal.scale}
            height={decal.scale}
            viewBox={viewBox}
            dangerouslySetInnerHTML={{ __html: inner }}
          />
        ) : (
          <image
            href={decal.artwork}
            x={-decal.scale / 2}
            y={-decal.scale / 2}
            width={decal.scale}
            height={decal.scale}
          />
        )}
      </g>
    </g>
  );
}
export function BoardArtwork({
  board,
  faces,
  artwork,
  sectorGuide = false,
}: {
  board: Board;
  faces: Face[];
  artwork: Record<string, string>;
  sectorGuide?: boolean;
}) {
  const guide = sectorGuide ? (
    <g data-editor-guide pointerEvents="none" opacity="0.45" dangerouslySetInnerHTML={{ __html: referenceSectors }} />
  ) : null;
  const polarFirst = faces
    .filter((face) => board.properties[face.key]?.type === 'polar')
    .sort(
      (a, b) =>
        (board.properties[a.key]?.paintOrder ?? faces.indexOf(a)) -
        (board.properties[b.key]?.paintOrder ?? faces.indexOf(b))
    )[0]?.key;
  const prefix = useId().replaceAll(':', '');
  return (
    <g data-generated-artwork>
      <defs>
        {faces.map((face, i) => (
          <clipPath key={face.key} id={`${prefix}-face-${i}`}>
            <path d={face.path} clipRule="evenodd" />
          </clipPath>
        ))}
      </defs>
      {faces
        .map((face, i) => ({ face, i }))
        .sort(
          (a, b) =>
            Number(board.properties[a.face.key]?.type === 'polar') -
              Number(board.properties[b.face.key]?.type === 'polar') ||
            (board.properties[a.face.key]?.paintOrder ?? a.i) - (board.properties[b.face.key]?.paintOrder ?? b.i)
        )
        .map(({ face, i }) => {
          const p = board.properties[face.key] || defaults('');
          const contours = p.appearance?.map((contour) => ({ contour, path: contourPath(board, contour) }));
          const customAppearance = !!contours?.length && contours.every((value) => value.path !== null);
          return (
            <g key={face.key}>
              {face.key === polarFirst && guide}
              <path
                d={face.path}
                fill={baseColors[p.type]}
                fillRule="evenodd"
                stroke={p.border ? '#000' : undefined}
                strokeWidth={p.border?.width}
                strokeLinecap={p.border?.linecap}
                strokeLinejoin={p.border?.linejoin}
              />
              {!customAppearance && p.type === 'stronghold' && (
                <path
                  d={face.path}
                  fill="none"
                  stroke={decorationColors.stronghold}
                  strokeWidth="13.2"
                  clipPath={`url(#${prefix}-face-${i})`}
                />
              )}
              {!customAppearance && p.insetLine !== 'none' && (
                <path
                  d={face.inset}
                  fill="none"
                  stroke={p.type === 'stronghold' ? '#F7BA7A' : decorationColors[p.type]}
                  strokeWidth="1.1"
                  strokeDasharray={p.insetLine === 'dashed' ? '6.6 3.3' : undefined}
                  strokeLinejoin="round"
                />
              )}
              {customAppearance &&
                contours.map(({ contour, path }, index) =>
                  contour.role === 'band' || p.insetLine !== 'none' ? (
                    <path
                      key={index}
                      d={path!}
                      fill={contour.fill}
                      fillRule="evenodd"
                      stroke={contour.stroke}
                      strokeWidth={contour.strokeWidth}
                      strokeLinecap={contour.strokeLinecap}
                      strokeLinejoin={contour.strokeLinejoin}
                      strokeDasharray={p.insetLine === 'dashed' ? contour.strokeDasharray || '6.6 3.3' : undefined}
                      strokeDashoffset={p.insetLine === 'dashed' ? contour.strokeDashoffset : undefined}
                      clipPath={`url(#${prefix}-face-${i})`}
                    />
                  ) : null
                )}
              <g clipPath={`url(#${prefix}-face-${i})`} data-clipped-territory={p.name}>
                {p.decals.map((decal) => (
                  <DecalArtwork key={decal.id} decal={decal} svg={artwork[decal.artwork]} />
                ))}
              </g>
            </g>
          );
        })}
      {!polarFirst && guide}
      <g fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {board.edges
          .filter((edge) => !faces.some((face) => board.properties[face.key]?.border && face.edges.includes(edge.id)))
          .map((edge) => (
            <path key={edge.id} d={edgePath(board, edge)} strokeWidth={edge.strokeWidth} />
          ))}
      </g>
    </g>
  );
}

export function BoardMap({ board }: { board: Board }) {
  const { faces, unrecoveredSegments } = derive(board);
  if (unrecoveredSegments || !faces.length) {
    throw new Error('The saved board geometry could not be rendered');
  }
  return (
    <svg viewBox="0 0 487.06 487.06" width="100%" height="100%" aria-label="Board artwork">
      <BoardArtwork board={board} faces={faces} artwork={BOARD_ARTWORK} />
    </svg>
  );
}
