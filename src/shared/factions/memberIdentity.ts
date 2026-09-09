import { z } from 'zod';

export const FactionMemberIdSchema = z.uuid();

type FactionMember = { memberId?: string };
type FactionRoster = { hero: FactionMember; leaders: FactionMember[] };
type IdentifiedRoster<T extends FactionRoster> = Omit<T, 'hero' | 'leaders'> & {
  hero: T['hero'] & { memberId: string };
  leaders: Array<T['leaders'][number] & { memberId: string }>;
};

/** These UUIDs identify members; they are not credentials. Convex supplies deterministic randomness during mutation retries. */
export function createFactionMemberId(): string {
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (digit) =>
    (Number(digit) ^ (Math.floor(Math.random() * 16) >> (Number(digit) / 4))).toString(16)
  );
}

export function factionMembersHaveIds(data: FactionRoster): boolean {
  return [data.hero, ...data.leaders].every((member) => member.memberId !== undefined);
}

export function assertUniqueFactionMemberIds(data: FactionRoster): void {
  const seen = new Set<string>();
  for (const member of [data.hero, ...data.leaders]) {
    if (member.memberId === undefined) {
      continue;
    }
    if (seen.has(member.memberId)) {
      throw new Error('Faction member IDs must be unique within the faction.');
    }
    seen.add(member.memberId);
  }
}

/** Assign missing identities once, preserving identified imports and same-source round trips. */
export function ensureFactionMemberIds<T extends FactionRoster>(data: T): IdentifiedRoster<T> {
  assertUniqueFactionMemberIds(data);
  const seen = new Set([data.hero, ...data.leaders].flatMap((member) => (member.memberId ? [member.memberId] : [])));
  function identify<Member extends FactionMember>(member: Member): Member & { memberId: string } {
    if (member.memberId) {
      return { ...member, memberId: member.memberId };
    }
    for (let attempt = 0; attempt < 128; attempt += 1) {
      const memberId = createFactionMemberId();
      if (!seen.has(memberId)) {
        seen.add(memberId);
        return { ...member, memberId };
      }
    }
    throw new Error('Could not allocate a unique faction member identity.');
  }
  return { ...data, hero: identify(data.hero), leaders: data.leaders.map(identify) };
}

/** Copying another faction replaces its members, even when names or images happen to match. */
export function renewFactionMemberIds<T extends FactionRoster>(data: T): IdentifiedRoster<T> {
  const withoutId = <Member extends FactionMember>({ memberId: _memberId, ...member }: Member) => member;
  return ensureFactionMemberIds({
    ...data,
    hero: withoutId(data.hero),
    leaders: data.leaders.map(withoutId),
  }) as IdentifiedRoster<T>;
}
