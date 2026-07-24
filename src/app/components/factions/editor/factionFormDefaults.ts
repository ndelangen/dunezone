import type { Faction } from '@db/factions';
import { DECAL, LEADERS, TROOP, TROOP_MODIFIER } from '@game/data/generated';
import { CURATED_PLANET_IMAGES } from '@game/data/planetCatalogue';

import { NONE_SELECT_VALUE, troopStarOptionToLabel } from './factionFormAssetUtils';

export function defaultLeader(): Faction['leaders'][number] {
  return {
    name: '',
    strength: '1',
    image: LEADERS.options[0],
  };
}

export function nextStrengthChar(value: Faction['leaders'][number]['strength']): string {
  const raw =
    value === undefined || value === null ? '' : typeof value === 'number' ? String(value) : value;
  const ch = raw.trim().slice(-1);
  if (ch.length === 0) return '1';

  if (/^[0-9]$/u.test(ch)) {
    return ch === '9' ? '0' : String.fromCharCode(ch.charCodeAt(0) + 1);
  }

  if (/^[a-z]$/u.test(ch)) {
    return ch === 'z' ? 'a' : String.fromCharCode(ch.charCodeAt(0) + 1);
  }

  if (/^[A-Z]$/u.test(ch)) {
    return ch === 'Z' ? 'A' : String.fromCharCode(ch.charCodeAt(0) + 1);
  }

  return '1';
}

export function nextLeaderImage(
  image: Faction['leaders'][number]['image']
): Faction['leaders'][number]['image'] {
  const total = LEADERS.options.length;
  if (total === 0) return LEADERS.options[0] as Faction['leaders'][number]['image'];
  const idx = LEADERS.options.indexOf(image);
  if (idx < 0) return LEADERS.options[0];
  return LEADERS.options[(idx + 1) % total];
}

export function nextLeaderFromLast(
  last: Faction['leaders'][number] | undefined
): Faction['leaders'][number] {
  if (last == null) return defaultLeader();
  return {
    name: 'new leader',
    strength: nextStrengthChar(last.strength),
    image: nextLeaderImage(last.image),
  };
}

export function defaultDecal(): Faction['decals'][number] {
  return {
    id: DECAL.options[0],
    muted: false,
    outline: false,
    scale: 0.5,
    offset: [0, 0],
  };
}

export function defaultTroop(): Faction['troops'][number] {
  return {
    name: '',
    image: TROOP.options[0],
    description: '',
    count: 20,
  };
}

export const troopStarOptions = [
  { value: NONE_SELECT_VALUE, label: 'None' },
  ...TROOP_MODIFIER.options.map((opt) => ({
    value: opt,
    label: troopStarOptionToLabel(opt),
  })),
] as const;

export function createTroopBackFromFront(
  front: Faction['troops'][number]
): NonNullable<Faction['troops'][number]['back']> {
  return {
    name: front.name,
    image: front.image,
    description: front.description,
    star: front.star,
    striped: front.striped === true ? undefined : true,
  };
}

export function defaultAdvantage(): Faction['rules']['advantages'][number] {
  return { text: '' };
}

export function defaultPlanet(): NonNullable<Faction['planet']>[number] {
  const firstImage = CURATED_PLANET_IMAGES[0]?.image;
  if (!firstImage) {
    throw new Error('The curated planet image catalogue must contain at least one image');
  }
  return {
    image: firstImage,
    name: '',
    description: '',
  };
}
