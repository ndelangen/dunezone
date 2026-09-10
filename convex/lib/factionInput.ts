import { ensureFactionMemberIds, factionMembersHaveIds } from '../../src/shared/factions/memberIdentity';
import { CanonicalFactionStoredSchema, FactionInputSchema } from '../../src/shared/factions/schema';

export function parseStoredFactionForRead(input: unknown) {
  return CanonicalFactionStoredSchema.parse(input);
}

export function parseFactionInput(
  input: unknown,
  { requireAuthoringSemantics = false }: { requireAuthoringSemantics?: boolean } = {}
) {
  const parsed = (requireAuthoringSemantics ? FactionInputSchema : CanonicalFactionStoredSchema).safeParse(input);
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
      [stored.hero, ...stored.leaders].some((member) => member.memberId !== undefined) &&
      !factionMembersHaveIds(data)
    ) {
      throw new Error('Reload this page before saving. This faction now uses persistent member identities.');
    }
  }
  return ensureFactionMemberIds(data);
}
