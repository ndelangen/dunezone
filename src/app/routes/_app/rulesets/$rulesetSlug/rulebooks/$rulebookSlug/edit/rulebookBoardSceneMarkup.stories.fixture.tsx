import { resolvePublicationCapture } from '@shared/asset-publishing/publicationTargets';
import { boardComponentGeometry } from '@shared/boards/componentGeometry';
import { arrakisBoard } from '@shared/boards/geometry';
import { RULEBOOK_BOARD_DEFINITIONS } from '@shared/rulebooks/boardDefinitions';
import type { RulebookBlockDraft } from '@shared/rulebooks/contents';

import type { RulebookEditorReferences } from './rulebookVisualBlockEditors';

export const BOARD = arrakisBoard();
const capture = resolvePublicationCapture('board');
const size = capture.output === 'image' ? capture : { widthPx: 1948, heightPx: 1948 };

/* The saved Arrakis board recreates the maintained map exactly, in the same frame, so the maintained image stands in for its capture. */
export const references: RulebookEditorReferences = {
  assetsById: {
    'saved-arrakis': {
      assetId: 'saved-arrakis',
      name: 'Arrakis Official',
      type: 'board',
      imageUrl: RULEBOOK_BOARD_DEFINITIONS[0]!.imageUrl,
      width: size.widthPx,
      height: size.heightPx,
      geometry: boardComponentGeometry(BOARD, size.widthPx, size.heightPx),
      publicationRevision: 'story',
      board: BOARD,
    },
    'token-bid': {
      assetId: 'token-bid',
      name: 'Bidding disc',
      type: 'token-disc',
      imageUrl: '/vector/icon/bidding_disc.svg',
    },
    'token-combat': {
      assetId: 'token-combat',
      name: 'Combat disc',
      type: 'token-disc',
      imageUrl: '/vector/icon/combat_disc.svg',
    },
  },
  factionsById: {},
};

export const scene = {
  id: 'BRDM',
  kind: 'board-scene',
  boardId: 'saved-arrakis',
  caption: 'Spice blows in the southern sands.',
  players: [],
  troops: [],
  highlights: [],
  annotations: [],
  tints: [
    { id: 'tint-spice', name: 'Spice blows', color: '#e8b92380', territories: ['funeral_plain', 'the_great_flat'] },
    {
      id: 'tint-storm',
      name: 'Shield Wall',
      color: '#1b1b1b',
      outline: true,
      stamps: ['explode'],
      territories: ['shield_wall'],
    },
  ],
  tokens: [
    { layerId: 'token-1', asset_id: 'token-bid', x: 160, y: 300, size: 40, rotation: 0 },
    { layerId: 'token-2', asset_id: 'token-combat', x: 320, y: 300, size: 40, rotation: 0 },
  ],
} satisfies RulebookBlockDraft;
