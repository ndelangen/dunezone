import { db } from '@db/core';
import { toLiveQueryResult, useLiveQuery } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

/** The Rulesets the battle wheel tool counts with, each with its battle dialing, by name. */
export function useBattleWheelRulesets() {
  return toLiveQueryResult(useLiveQuery(api.battleWheelTool.rulesets, {}));
}

/** A faction's definition as a game captures it: its leaders, troops and their battle values. A one-off read, so picking holds no subscription. */
export async function readFactionDefinition(factionId: string) {
  return await db.query(api.playCatalogue.factionDefinition, { factionId }, { hold: false });
}
