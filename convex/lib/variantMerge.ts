import { INHERITABLE_FIELDS, readField } from '../../src/shared/factions/variantFields';
import type { InheritableField } from '../../src/shared/factions/variantFields';
import { canonicalJson } from './canonicalJson';

/** The ids a leader or troop carries, which label it and say nothing about its content. */
const ID_KEYS = new Set(['memberId', 'troopId']);

/** The value with every leader and troop id left out, so separately authored copies of one content compare equal (#2914). */
function withoutIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutIds);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !ID_KEYS.has(key))
        .map(([key, child]) => [key, withoutIds(child)])
    );
  }
  return value;
}

/** The inheritable fields whose content the variant shares with the parent, ids aside: the ones a merge switches to Use parent variant. */
export function matchingFields(parent: object, variant: object): InheritableField[] {
  return INHERITABLE_FIELDS.filter(
    (field) =>
      canonicalJson(withoutIds(readField(parent, field))) === canonicalJson(withoutIds(readField(variant, field)))
  );
}

/** Old id to new id, for leaders (`members`) and troops. */
export type ComponentIdMap = { members: Record<string, string>; troops: Record<string, string> };

/** The fields whose entries carry ids, each with the ids it gives up for the parent's, so a row takes only the pairs of the fields it follows. */
export type IdPairsByField = Partial<Record<'factionLeader' | 'leaders' | 'troops', Record<string, string>>>;

type Member = { memberId?: string };
type Roster = { factionLeader: Member; leaders: Member[]; troops: Array<{ troopId?: string }> };

function pairs<T>(from: readonly T[], to: readonly (T | undefined)[], idOf: (entry: T) => string | undefined) {
  const map: Record<string, string> = {};
  from.forEach((entry, index) => {
    const [old, next] = [idOf(entry), to[index] && idOf(to[index])];
    if (old && next && old !== next) {
      map[old] = next;
    }
  });
  return map;
}

/**
 * The ids the variant's leaders and troops take from the parent's when it starts following `fields`, by field.
 * Matching fields hold equal content, so their entries pair up by position.
 */
export function idPairsByField(parent: Roster, variant: Roster, fields: readonly InheritableField[]): IdPairsByField {
  const memberId = (member: Member) => member.memberId;
  return {
    ...(fields.includes('factionLeader')
      ? { factionLeader: pairs([variant.factionLeader], [parent.factionLeader], memberId) }
      : {}),
    ...(fields.includes('leaders') ? { leaders: pairs(variant.leaders, parent.leaders, memberId) } : {}),
    ...(fields.includes('troops') ? { troops: pairs(variant.troops, parent.troops, (troop) => troop.troopId) } : {}),
  };
}

/** The pairs as one map per kind of id. */
export function idMapFor(byField: IdPairsByField): ComponentIdMap {
  return { members: { ...byField.factionLeader, ...byField.leaders }, troops: { ...byField.troops } };
}

/** The pairs a child passes on to its own children: those of the fields it follows. */
export function followedPairs(byField: IdPairsByField, fields: readonly string[]): IdPairsByField {
  return Object.fromEntries(Object.entries(byField).filter(([field]) => fields.includes(field)));
}

function lookup(map: Record<string, string>, id: string) {
  return Object.hasOwn(map, id) ? map[id] : undefined;
}

export function isEmptyIdMap(map: ComponentIdMap) {
  return Object.keys(map.members).length === 0 && Object.keys(map.troops).length === 0;
}

/**
 * The value with each leader and troop reference into a faction of `maps` rewritten through that faction's map, and how many it rewrote.
 * A reference belongs to the nearest `factionId` around it, as in a battle side, whose troops name only their `troopId`.
 */
export function rewriteComponentReferences(
  value: unknown,
  maps: ReadonlyMap<string, ComponentIdMap>
): { value: unknown; rewritten: number } {
  let rewritten = 0;
  const visit = (node: unknown, factionId: string | undefined): unknown => {
    if (Array.isArray(node)) {
      return node.map((child) => visit(child, factionId));
    }
    if (!node || typeof node !== 'object') {
      return node;
    }
    const record = node as Record<string, unknown>;
    const scope = typeof record.factionId === 'string' ? record.factionId : factionId;
    const map = scope === undefined ? undefined : maps.get(scope);
    return Object.fromEntries(
      Object.entries(record).map(([key, child]) => {
        const replacement =
          map && typeof child === 'string'
            ? lookup(key === 'memberId' ? map.members : key === 'troopId' ? map.troops : {}, child)
            : undefined;
        if (replacement !== undefined) {
          rewritten += 1;
          return [key, replacement];
        }
        return [key, visit(child, scope)];
      })
    );
  };
  const next = visit(value, undefined);
  return { value: rewritten ? next : value, rewritten };
}
