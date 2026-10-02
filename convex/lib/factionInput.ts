import { ensureFactionComponentIds } from '../../src/shared/factions/componentIdentity';
import { factionMembersHaveIds } from '../../src/shared/factions/memberIdentity';
import { CanonicalFactionStoredSchema, FactionWriteSchema } from '../../src/shared/factions/schema';
import { factionTroopsHaveIds } from '../../src/shared/factions/troopIdentity';
import type { Doc } from '../_generated/dataModel';

export function parseStoredFactionForRead(input: unknown) {
  return CanonicalFactionStoredSchema.parse(input);
}

/**
 * A stored faction row as a query returns it: its `data` parsed, so the wire matches `factionDataValidator`.
 * A raw row could carry the old `hero` key, which that validator refuses.
 */
export function factionRowForClient(row: Doc<'factions'>) {
  return { ...row, data: parseStoredFactionForRead(row.data) };
}

export function parseFactionInput(
  input: unknown,
  { requireAuthoringSemantics = false }: { requireAuthoringSemantics?: boolean } = {}
) {
  const parsed = (requireAuthoringSemantics ? FactionWriteSchema : CanonicalFactionStoredSchema).safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const issuePath = firstIssue?.path.join('.') ?? 'data';
    const issueMessage = firstIssue?.message ?? 'Invalid faction data';
    throw new Error(`Invalid faction data at ${issuePath}: ${issueMessage}`);
  }
  return parsed.data;
}

/** Canonical writes always contain IDs; old tabs cannot erase identities after adoption. */
export function factionInputForWrite(input: unknown, previous?: unknown) {
  const data = parseFactionInput(input, { requireAuthoringSemantics: true });
  if (previous !== undefined) {
    const stored = parseStoredFactionForRead(previous);
    if (
      [stored.factionLeader, ...stored.leaders].some((member) => member.memberId !== undefined) &&
      !factionMembersHaveIds(data)
    ) {
      throw new Error('Reload this page before saving. This faction now uses persistent member identities.');
    }
    if (stored.troops.some((troop) => troop.troopId !== undefined) && !factionTroopsHaveIds(data)) {
      throw new Error('Reload this page before saving. This faction now uses persistent troop identities.');
    }
  }
  return ensureFactionComponentIds(data);
}
