import type { CaptureSelection } from '@shared/play/inventory';

import { readAssetSupply } from '@db/play';

import { GameCatalogue } from '../../../../../../workers/game/catalogue';

/*
 * The game Worker's catalogue capture, run in the page for a tutorial table: the same checks and the same pieces,
 * read through the page's own public catalogue query instead of the Worker's client, so a tutorial brings in a deck,
 * bundle or token made in the editor as a real game does.
 */
export class LocalCatalogue extends GameCatalogue {
  constructor(applicationOrigin: string) {
    super('', applicationOrigin);
  }

  protected override async readSupply(selection: CaptureSelection): Promise<unknown> {
    return await readAssetSupply(selection);
  }
}
