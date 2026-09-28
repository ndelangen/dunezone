import { z } from 'zod';

import { assertUniqueIds, createComponentId, uniqueIdAllocator } from './componentIds';

export const FactionMemberIdSchema = z.uuid();

type FactionMember = { memberId?: string };
type FactionRoster = { hero: FactionMember; leaders: FactionMember[] };
type IdentifiedRoster<T extends FactionRoster> = Omit<T, 'hero' | 'leaders'> & {
  hero: T['hero'] & { memberId: string };
  leaders: Array<T['leaders'][number] & { memberId: string }>;
};

export const createFactionMemberId = createComponentId;

export function factionMembersHaveIds(data: FactionRoster): boolean {
  return [data.hero, ...data.leaders].every((member) => member.memberId !== undefined);
}

export function assertUniqueFactionMemberIds(data: FactionRoster): void {
  assertUniqueIds(
    [data.hero, ...data.leaders].map((member) => member.memberId),
    'Faction member IDs must be unique within the faction.'
  );
}

/** Assign missing identities once, preserving identified imports and same-source round trips. */
export function ensureFactionMemberIds<T extends FactionRoster>(data: T): IdentifiedRoster<T> {
  assertUniqueFactionMemberIds(data);
  const allocate = uniqueIdAllocator(
    [data.hero, ...data.leaders].map((member) => member.memberId),
    'Could not allocate a unique faction member identity.'
  );
  const identify = <Member extends FactionMember>(member: Member): Member & { memberId: string } => ({
    ...member,
    memberId: member.memberId || allocate(),
  });
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
