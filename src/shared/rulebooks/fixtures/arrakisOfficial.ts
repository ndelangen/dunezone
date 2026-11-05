import { componentGeometrySchema } from '../../asset-publishing/componentGeometry';
import arrakisOfficialGeometry from './arrakis-official-geometry.json';

/**
 * The saved Arrakis Official board as a Rulebook resolves it, for stories and tests: its published face, which Storybook answers with the captured image, and that capture's geometry.
 */
export const ARRAKIS_OFFICIAL = {
  id: 'arrakis-official-board',
  name: 'Arrakis Official',
  imageUrl: '/published/boards/arrakis-official-board/board.jpg',
  geometry: componentGeometrySchema.parse(arrakisOfficialGeometry),
  revision: 'b3770ccb-8220-4ea0-a555-fed75125cf93',
} as const;
