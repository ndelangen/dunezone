import { api } from '../../convex/_generated/api';
import { CatalogueCapture } from '../../src/shared/play/catalogueCapture';
import type { DraftFaction } from '../../src/shared/play/drafting';
import { playDraftableFactionsSchema } from '../../src/shared/play/drafting';
import { gameHttpClient } from './gameHttpClient';
import type { ConvexObserver } from './gameHttpClient';

/** The catalogue as the game Worker reads it: the shared capture over public HTTP queries, plus the draft's faction list. */
export class GameCatalogue extends CatalogueCapture {
  constructor(
    private readonly convexUrl: string,
    applicationOrigin: string,
    private readonly observe?: ConvexObserver
  ) {
    const client = () => gameHttpClient(convexUrl, observe);
    super(
      {
        rulesetSupply: async (rulesetId) => await client().query(api.playCatalogue.rulesetSupply, { rulesetId }),
        factionDefinition: async (factionId) =>
          await client().query(api.playCatalogue.factionDefinition, { factionId }),
        assetSupply: async (selection) => await client().query(api.playCatalogue.assetSupply, selection),
      },
      applicationOrigin
    );
  }

  /** Every live faction with its link to the game's ruleset, for the draft; the capture at assignment judges readiness. */
  async draftableFactions(rulesetId: string): Promise<DraftFaction[]> {
    const raw: unknown = await gameHttpClient(this.convexUrl, this.observe).query(api.playCatalogue.draftableFactions, {
      rulesetId,
    });
    return playDraftableFactionsSchema.parse(raw).factions;
  }
}
