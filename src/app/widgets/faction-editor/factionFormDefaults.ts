import { DECAL, LEADERS, TROOP } from '@shared/assetIds';
import { DEFAULT_PHASE_PRIORITY } from '@shared/factions/extraPhases';
import { createFactionMemberId } from '@shared/factions/memberIdentity';
import { createFactionTroopId } from '@shared/factions/troopIdentity';

import type { Faction } from '@db/factions';
import { CURATED_PLANET_IMAGES } from '@game/data/planetCatalogue';

function defaultLeader(): Faction['leaders'][number] {
  return {
    memberId: createFactionMemberId(),
    name: '',
    strength: '1',
    image: LEADERS.options[0],
  };
}

function nextStrengthChar(value: Faction['leaders'][number]['strength']): string {
  const raw = value === undefined || value === null ? '' : typeof value === 'number' ? String(value) : value;
  const ch = raw.trim().slice(-1);
  if (ch.length === 0) {
    return '1';
  }

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

function nextLeaderImage(image: Faction['leaders'][number]['image']): Faction['leaders'][number]['image'] {
  const total = LEADERS.options.length;
  if (total === 0) {
    return LEADERS.options[0] as Faction['leaders'][number]['image'];
  }
  const idx = LEADERS.options.indexOf(image);
  if (idx < 0) {
    return LEADERS.options[0];
  }
  return LEADERS.options[(idx + 1) % total];
}

export function nextLeaderFromLast(last: Faction['leaders'][number] | undefined): Faction['leaders'][number] {
  if (last == null) {
    return defaultLeader();
  }
  return {
    memberId: createFactionMemberId(),
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
    troopId: createFactionTroopId(),
    name: '',
    image: TROOP.enum['/vector/troop/atreides.svg'],
    description: '',
    count: 20,
  };
}

export function createTroopBackFromFront(
  front: Faction['troops'][number]
): NonNullable<Faction['troops'][number]['back']> {
  return {
    name: front.name,
    image: front.image,
    description: front.description,
    star: front.star,
    striped: front.striped === true ? undefined : true,
    /* Until now the reverse inherited these, so the new back starts from them rather than from nothing. */
    capable: front.capable,
    combat: front.combat ? { ...front.combat } : undefined,
  };
}

type TroopBattleValues = NonNullable<Faction['troops'][number]['combat']>;

/**
 * One battle value entered or cleared on a troop face;
 * clearing the last one removes the face's battle values.
 * A face with only one strength is kept as the author left it, so saving names the missing one rather than inventing it.
 */
export function nextTroopBattleValues(
  current: Faction['troops'][number]['combat'],
  key: keyof TroopBattleValues,
  value: number | undefined
): Faction['troops'][number]['combat'] {
  const next: Partial<TroopBattleValues> = { ...current, [key]: value };
  if (value === undefined) {
    delete next[key];
  }
  return Object.keys(next).length ? (next as TroopBattleValues) : undefined;
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

/**
 * A fresh phase row: its id is generated here and never shown.
 * Title, symbol and placement start blank on purpose, since only the author can choose them;
 * the shared schema names each one inline and holds Save until they are chosen.
 */
export function defaultPhaseDeclaration(): NonNullable<Faction['extraPhases']>[number] {
  return {
    id: createFactionMemberId(),
    type: 'instruction',
    title: '',
    priority: DEFAULT_PHASE_PRIORITY,
    allPlayersMustBeReady: false,
  } as NonNullable<Faction['extraPhases']>[number];
}
