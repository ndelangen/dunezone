import { publishingSpiceCard } from '@shared/assets/fixtures/publishingSpiceCard';
import { spiceBoardLink, spiceBoardTokens } from '@shared/assets/fixtures/spiceBoardCard';
import { arrakisBoard } from '@shared/boards/geometry';
import { boardTerritoryList } from '@shared/boards/tintDrawing';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useState } from 'react';
import type { ComponentProps } from 'react';

import type { BoardSelect } from '@app/pickers/BoardPicker';

import type { AssetPick } from './SpiceBoardFields';
import { SpiceCardEditor } from './SpiceCardEditor';
import type { SpiceChapter, SpiceDraft } from './SpiceCardEditor';

/* Stand-ins for the routes' pickers: one button picks a fixture asset. */
export const pickOne =
  (label: string, id: string): AssetPick =>
  (onPick) => (
    <button type="button" onClick={() => onPick(id)}>
      {label}
    </button>
  );

/* Stand-in for the page's board field: the offered boards plus one saved fixture board, as a plain select. */
export const boardSelect: BoardSelect = ({ label, value, fixed, onPick }) => (
  <select aria-label={label} value={value} onChange={(event) => onPick(event.currentTarget.value)}>
    {[...fixed, { id: 'arrakis-board', name: 'Arrakis' }].map((board) => (
      <option key={board.id} value={board.id}>
        {board.name}
      </option>
    ))}
  </select>
);

const BOARD = arrakisBoard();
const boardRead = { board: BOARD, boardName: 'Arrakis', tokens: spiceBoardTokens, error: null };

/** The editor with its draft in state, as a page holds it, so the brush and token drags change the proof. */
export function LiveEditor({ initial, ...props }: ComponentProps<typeof SpiceCardEditor> & { initial: SpiceDraft }) {
  const [draft, setDraft] = useState(initial);
  const [chapter, setChapter] = useState<SpiceChapter>(props.chapter);
  return (
    <WorkbenchLayout>
      <SpiceCardEditor
        {...props}
        draft={draft}
        chapter={chapter}
        onChapterChange={setChapter}
        patch={(update) => {
          props.patch(update);
          setDraft((current) => ({ ...current, ...update }));
        }}
        boardRead={draft.board ? boardRead : undefined}
      />
    </WorkbenchLayout>
  );
}

/** The rail proof: the one card the editing surface sits on, not the look choice's previews. */
export const proofOf = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLElement>('[class*="mapEdit"]')!.parentElement!;

/** The point on screen over a territory's centre on the proof's map. */
export function territoryOnScreen(canvasElement: HTMLElement, id: string) {
  const surface = canvasElement.querySelector('[data-brush]')!.getBoundingClientRect();
  const face = boardTerritoryList(BOARD).find((territory) => territory.id === id)!.face;
  const [x, y] = face.center;
  return { x: surface.left + (x / 487.06) * surface.width, y: surface.top + (y / 487.06) * surface.height };
}

export const onBoard: SpiceDraft = { ...publishingSpiceCard, name: 'Funeral Plain', board: spiceBoardLink };
