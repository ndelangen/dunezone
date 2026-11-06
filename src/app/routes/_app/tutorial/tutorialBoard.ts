import { arrakisBoardCapture } from '@shared/boards/arrakisPreset';
import type { BoardCapture } from '@shared/play/capture';

import type { ArrakisBoard } from '@db/arrakis';

/**
 * The board a tutorial table plays on: the saved Arrakis, or, on a site without a published one, the bundled Arrakis, since the chapters' tasks need territories.
 * `undefined` while the saved one loads.
 */
export function tutorialBoard(arrakis: ArrakisBoard | null | undefined): BoardCapture | undefined {
  return arrakis === null ? arrakisBoardCapture : arrakis?.capture;
}
