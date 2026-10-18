import { arrakisBoard, blankBoard } from '@shared/boards/geometry';
import { BoardAsset } from '@shared/boards/schema';
import type { BoardAssetData } from '@shared/boards/schema';

import { assetLoadSource } from '@app/pickers/assetLoadSource';

/** The board editors' load source: saved boards, plus the blank and stock Arrakis boards as presets. */
export function boardLoadSource(excludeId?: string) {
  return assetLoadSource<BoardAssetData>({
    type: 'board',
    schema: BoardAsset,
    excludeId,
    presets: [
      { label: 'Blank', name: 'a blank board', data: { name: '', about: '', board: blankBoard() } },
      { label: 'Arrakis', name: 'Arrakis', data: { name: 'Arrakis', about: '', board: arrakisBoard() } },
    ],
  });
}
