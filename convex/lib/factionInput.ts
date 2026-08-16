import { normalizeStoredFactionComplexity } from '../../src/shared/factions/complexity';
import {
  CanonicalFactionStoredSchema,
  TransitionalFactionInputSchema,
} from '../../src/shared/factions/schema';

export function parseStoredFactionForRead(input: unknown) {
  return normalizeStoredFactionComplexity(CanonicalFactionStoredSchema.parse(input));
}

export function parseFactionInput(
  input: unknown,
  { requireAuthoringSemantics = false }: { requireAuthoringSemantics?: boolean } = {}
) {
  const parsed = (
    requireAuthoringSemantics ? TransitionalFactionInputSchema : CanonicalFactionStoredSchema
  ).safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const issuePath = firstIssue?.path.join('.') ?? 'data';
    const issueMessage = firstIssue?.message ?? 'Invalid faction data';
    throw new Error(`Invalid faction data at ${issuePath}: ${issueMessage}`);
  }
  return parsed.data;
}
