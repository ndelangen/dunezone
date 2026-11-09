import { troopBattleFaces } from '@shared/factions/troopBattle';
import { factionDefinitionSchema } from '@shared/play/capture';

const wheelFactionSchema = factionDefinitionSchema.pick({ faction: true, data: true });

import type { WheelFaction } from './battleWheel';

/**
 * A faction as the battle wheel reads it (`battleWheelTool.faction`), the definition a game captures with its backgrounds resolved.
 * It keeps the leaders with their strengths, and every troop face that can fight with its battle values and how many the faction owns.
 * A face without battle values stays out, as it does in a game.
 * A leader whose strength is a letter (Zoal's X) is set at the battle.
 * Null when the faction is gone or its definition does not parse.
 */
export function wheelFactionFrom(raw: unknown): WheelFaction | null {
  const parsed = wheelFactionSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.data) {
    return null;
  }
  const { faction, data } = parsed.data;
  return {
    id: faction.id,
    name: data.name,
    emblem: data.emblem,
    background: data.background,
    leaders: data.leaders.map((leader, index) => ({
      id: leader.memberId ?? `leader-${index}`,
      name: leader.name,
      strength: printedStrength(leader.strength),
      image: leader.image,
    })),
    faces: troopBattleFaces(data.troops).flatMap(({ id, troopIndex, face, capable, values }) => {
      const troop = data.troops[troopIndex]!;
      return capable && values
        ? [
            {
              id,
              name: face.name,
              capable: true,
              ...values,
              count: troop.count,
              troop: `troop-${troopIndex}`,
              image: face.image,
              star: face.star,
              hue: face.hue,
              striped: face.striped,
            },
          ]
        : [];
    }),
  };
}

/* A leader's printed strength: a number, or a single digit stored as text; anything else, such as X, varies at the table. */
function printedStrength(strength: number | string | undefined) {
  if (typeof strength === 'number') {
    return strength;
  }
  return strength !== undefined && /^\d$/.test(strength) ? Number(strength) : null;
}
