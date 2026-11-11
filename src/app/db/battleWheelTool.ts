import { db } from '@db/core';
import { toLiveQueryResult, useLiveQuery } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

/** The Rulesets the battle wheel tool counts with, each with its battle dialing, by name. */
export function useBattleWheelRulesets() {
  return toLiveQueryResult(useLiveQuery(api.battleWheelTool.rulesets, {}));
}

/** A faction's leaders, troops and their battle values, with its backgrounds as they are now. A one-off read, so picking holds no subscription. */
export async function readWheelFaction(factionId: string) {
  return await db.query(api.battleWheelTool.faction, { factionId }, { hold: false });
}
