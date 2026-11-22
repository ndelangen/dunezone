import type { z } from 'zod';

import { recalculateFactionComplexity } from './complexity';
import { createFactionMemberId } from './memberIdentity';
import { FactionWriteSchema } from './schema';
import type { CanonicalFactionStoredObject } from './schema';

type StoredFaction = z.infer<typeof CanonicalFactionStoredObject>;

/**
 * Every variant property a variant may take from its parent variant, each its own toggle (#2905).
 * The shared fields are the Faction's, not the parent's, and the calculated complexity follows the resolved rules.
 */
export const INHERITABLE_FIELDS = [
  'factionLeader',
  'leaders',
  'decals',
  'planet',
  'troops',
  'rules.startText',
  'rules.revivalText',
  'rules.spiceCount',
  'rules.treacheryTracker',
  'rules.advantages',
  'rules.fate',
  'rules.alliance',
  'extras',
  'extraPhases',
  'complexity.manual',
] as const;

export type InheritableField = (typeof INHERITABLE_FIELDS)[number];

/**
 * Each inheritable field under the name the faction editor gives its Use parent variant choice.
 * `rules.fate` is the exception there: the editor names it by the variant's own label for the rule, Fate or Karama.
 */
export const INHERITABLE_FIELD_LABELS: Record<InheritableField, string> = {
  factionLeader: 'Faction leader',
  leaders: 'Supporting leaders',
  decals: 'Decals',
  planet: 'Planets',
  troops: 'Troops',
  'rules.startText': 'Starting instructions',
  'rules.revivalText': 'Revival instructions',
  'rules.spiceCount': 'Starting spice',
  'rules.treacheryTracker': 'Treachery tracker',
  'rules.advantages': 'Faction advantages',
  'rules.fate': 'Fate',
  'rules.alliance': 'Alliance advantage',
  extras: 'Faction Extras',
  extraPhases: 'Faction phases',
  'complexity.manual': 'Complexity',
};

type Path = [string] | [string, string];

function pathOf(field: InheritableField): Path {
  return field.split('.') as Path;
}

/** The value the data holds for one inheritable field, which is what a variant following it takes. */
export function readField(data: object, field: InheritableField): unknown {
  const [key, inner] = pathOf(field);
  const value = (data as Record<string, unknown>)[key];
  return inner === undefined ? value : (value as Record<string, unknown> | undefined)?.[inner];
}

/** A copy with the field set, or left out when the value is undefined, the way an optional field is stored. */
function writeField<T extends object>(data: T, field: InheritableField, value: unknown): T {
  const [key, inner] = pathOf(field);
  const record = data as Record<string, unknown>;
  const next = inner === undefined ? value : withKey((record[key] ?? {}) as Record<string, unknown>, inner, value);
  return withKey(record, key, next) as T;
}

function withKey(record: Record<string, unknown>, key: string, value: unknown) {
  const { [key]: _old, ...rest } = record;
  return value === undefined ? rest : { ...rest, [key]: value };
}

/** The inheritable fields a copy leaves out, which a variant following a parent takes from it (#2916). */
export function omittedFields(data: object): InheritableField[] {
  return INHERITABLE_FIELDS.filter((field) => readField(data, field) === undefined);
}

/** The copy with each named field taken from the parent, before the copy is checked as a whole. */
export function withParentFields<T extends object>(parent: object, data: T, fields: readonly InheritableField[]): T {
  return fields.reduce((copy, field) => writeField(copy, field, readField(parent, field)), data);
}

/** The copy without the named fields: what a variant holds of its own when it follows its parent in them. */
function withoutFields<T extends object>(data: T, fields: readonly InheritableField[]): T {
  return fields.reduce((copy, field) => writeField(copy, field, undefined), data);
}

/**
 * What a variant holds of its own while it follows its parent in the named fields: everything but those fields and the calculated complexity, which `resolveVariantData` rewrites on every push-down.
 * A push-down can still give one of the variant's own leaders a fresh identity when it collides with an inherited one, which this does not hide.
 */
export function ownVariantData<T extends { complexity?: object }>(data: T, fields: readonly InheritableField[]) {
  const { complexity, ...own } = withoutFields(data, fields);
  const { calculated: _calculated, ...rest } = (complexity ?? {}) as { calculated?: number };
  return { ...own, complexity: rest };
}

/** Keeps only names of inheritable fields, once each and in their canonical order. */
export function normalizeInheritedFields(fields: readonly string[]): InheritableField[] {
  return INHERITABLE_FIELDS.filter((field) => fields.includes(field));
}

/**
 * The variant's full data with every inherited field taken from its parent's current data.
 * A custom leader that would share its identity with an inherited one gets a fresh identity, since identities are unique within a faction.
 * The calculated complexity follows the resolved rules.
 */
export function resolveVariantData(
  parent: StoredFaction,
  child: StoredFaction,
  inherited: readonly InheritableField[]
): StoredFaction {
  const resolved = inherited.reduce((data, field) => writeField(data, field, readField(parent, field)), child);
  return recalculateFactionComplexity(withUniqueMemberIds(resolved, inherited));
}

/** A leader that would share its identity with an inherited one gets a fresh identity, since identities are unique within a faction. */
export function withUniqueMemberIds(data: StoredFaction, inherited: readonly InheritableField[]): StoredFaction {
  if (inherited.includes('leaders')) {
    const taken = new Set(data.leaders.map((leader) => leader.memberId));
    return taken.has(data.factionLeader.memberId)
      ? { ...data, factionLeader: { ...data.factionLeader, memberId: createFactionMemberId() } }
      : data;
  }
  const leaderId = data.factionLeader.memberId;
  return {
    ...data,
    leaders: data.leaders.map((leader) =>
      leader.memberId === leaderId ? { ...leader, memberId: createFactionMemberId() } : leader
    ),
  };
}

/**
 * What a save would refuse in the variant's resolved data, in words for its page (#2908).
 * A parent's change still reaches the variant;
 * this list tells its owner what to fix.
 */
export function variantProblems(data: StoredFaction): string[] {
  const parsed = FactionWriteSchema.safeParse(data);
  const schemaProblems = parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join('.') || 'data'}: ${issue.message}`);
  const planets = new Set((data.planet ?? []).map((planet) => planet.name));
  const troopProblems = data.troops
    .filter((troop) => troop.planet !== undefined && !planets.has(troop.planet))
    .map((troop) => `The troop "${troop.name}" names the planet "${troop.planet}", which this variant does not have.`);
  return [...schemaProblems, ...troopProblems];
}
