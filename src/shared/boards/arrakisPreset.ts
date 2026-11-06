import type { BoardCapture } from '../play/capture';
import arrakis from './arrakis.json';
import { ARRAKIS_BOARD_SLUG } from './arrakisOfficial';
import { BoardDefinition } from './schema';

/**
 * The bundled Arrakis preset, also published as Arrakis Official in the production catalogue.
 * Tables without a board of their own play on it: the homepage, the tutorial, and games retained before they captured a ruleset board.
 */
export const arrakisBoardCapture: BoardCapture = {
  asset: { id: 'arrakis-board', slug: ARRAKIS_BOARD_SLUG, name: 'Arrakis Official' },
  definition: BoardDefinition.parse(arrakis.board),
};
