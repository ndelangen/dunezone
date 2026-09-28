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
