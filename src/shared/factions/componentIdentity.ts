import { ensureFactionMemberIds, renewFactionMemberIds } from './memberIdentity';
import { ensureFactionTroopIds, renewFactionTroopIds } from './troopIdentity';

type Roster = Parameters<typeof ensureFactionMemberIds>[0] & Parameters<typeof ensureFactionTroopIds>[0];

/** Every generated faction component keeps an identity: leaders by member, troop types by troop (#1227). */
export function ensureFactionComponentIds<T extends Roster>(data: T) {
  return ensureFactionTroopIds(ensureFactionMemberIds(data));
}

/** A copied faction's components are new components, whatever they share with the source. */
export function renewFactionComponentIds<T extends Roster>(data: T) {
  return renewFactionTroopIds(renewFactionMemberIds(data));
}

type Named = { name?: string };
type NamedRoster = {
  factionLeader: Named & { memberId?: string };
  leaders: Array<Named & { memberId?: string }>;
  troops: Array<Named & { troopId?: string }>;
};

/** Each named component's stored identity, handed out once, so two components of one name never share it. */
function storedIdsByName<C extends Named>(stored: C[], id: (component: C) => string | undefined) {
  const taken = new Set<string>();
  return (name: string | undefined) => {
    const found = stored.find((candidate) => candidate.name === name && !taken.has(id(candidate) ?? ''));
    const value = found && id(found);
    if (value) {
      taken.add(value);
    }
    return value;
  };
}

/**
 * A copy without identities, as a hand-written import gives one, takes those of the stored components it names, and new ones for the rest (#2931).
 * A copy that carries any identity is only completed, the way any write is.
 */
export function withStoredComponentIds<T extends Roster & NamedRoster>(data: T, stored: NamedRoster) {
  const memberIdOf = storedIdsByName([stored.factionLeader, ...stored.leaders], (member) => member.memberId);
  const troopIdOf = storedIdsByName(stored.troops, (troop) => troop.troopId);
  const bare = [data.factionLeader, ...data.leaders].every((member) => member.memberId === undefined);
  const bareTroops = data.troops.every((troop) => troop.troopId === undefined);
  const adopt = <M extends Named & { memberId?: string }>(member: M) =>
    bare ? { ...member, memberId: memberIdOf(member.name) } : member;
  return ensureFactionComponentIds({
    ...data,
    factionLeader: adopt(data.factionLeader),
    leaders: data.leaders.map(adopt),
    troops: bareTroops
      ? data.troops.map((troop) => ({ ...troop, troopId: troopIdOf((troop as Named).name) }))
      : data.troops,
  });
}
