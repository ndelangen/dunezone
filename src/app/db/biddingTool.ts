import { TOOL_HIDDEN_RULESETS } from '@shared/rulesets/hidden';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';

import { api } from '../../../convex/_generated/api';

export type BiddingSetup = NonNullable<FunctionReturnType<typeof api.biddingTool.setup>>;
export type BiddingFaction = BiddingSetup['seats'][number];
export type BiddingRuleset = BiddingSetup['ruleset'];

/** The existing bounded tool ruleset list, read once when setup opens. */
export async function readBiddingRulesets() {
  const rows = await db.query(api.battleWheelTool.rulesets, {}, { hold: false });
  return rows
    .filter((row) => !TOOL_HIDDEN_RULESETS.has(row.slug))
    .map(({ rulesetId: id, slug, name }) => ({ id, slug, name }));
}

/** Capture only the chosen table's display data; active tables and phone remotes hold no catalogue subscription. */
export async function readBiddingSetup(rulesetId: string) {
  return await db.query(api.biddingTool.setup, { rulesetId }, { hold: false });
}

/** Complete a custom faction choice with its published token and the prototype's known reminders. */
export async function readBiddingFaction(factionId: string) {
  return await db.query(api.biddingTool.faction, { factionId }, { hold: false });
}
