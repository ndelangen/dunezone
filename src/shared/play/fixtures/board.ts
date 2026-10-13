import arrakis from '../../boards/arrakis.json';
import { BoardDefinition } from '../../boards/schema';
import type { BoardCapture } from '../capture';

/* The editable Arrakis preset, also published as Arrakis Official in the production catalogue. */
export const arrakisBoardCapture: BoardCapture = {
  asset: { id: 'arrakis-board', slug: 'arrakis-official', name: 'Arrakis Official' },
  definition: BoardDefinition.parse(arrakis.board),
};
