import { CENTER, RADIUS } from '@shared/boards/geometry';
import type { Board } from '@shared/boards/schema';
import { boardTerritories } from '@shared/boards/territories';
import { renderToStaticMarkup } from 'react-dom/server';
import { SRGBColorSpace, Texture } from 'three';

import { BOARD_ARTWORK } from '@game/assets/board/artwork';
import { BoardArtwork } from '@game/assets/board/Board';

/** Inline images cannot depend on external SVG resources when the browser rasterizes their parent. */
export async function authoredBoardTexture(board: Board, signal: AbortSignal): Promise<Texture> {
  const paths = [...new Set(Object.values(board.properties).flatMap((p) => p.decals.map((d) => d.artwork)))];
  const artwork = { ...BOARD_ARTWORK };
  await Promise.all(
    paths.map(async (path) => {
      if (artwork[path]) {
        return;
      }
      if (!/^\/vector\/[A-Za-z0-9_./-]+\.svg$/.test(path) || path.split('/').includes('..')) {
        throw new Error('The board references unavailable artwork');
      }
      const response = await fetch(path, { signal });
      if (!response.ok) {
        throw new Error('The board artwork could not be loaded');
      }
      artwork[path] = await response.text();
    })
  );
  signal.throwIfAborted();
  const svg = renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="2048"
      height="2048"
      viewBox={`${CENTER[0] - RADIUS} ${CENTER[1] - RADIUS} ${RADIUS * 2} ${RADIUS * 2}`}
    >
      <BoardArtwork board={board} faces={boardTerritories(board)} artwork={artwork} />
    </svg>
  );
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    const texture = new Texture(image);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  } finally {
    URL.revokeObjectURL(url);
  }
}
