import type { Faction } from '@db/factions';
import { defaultFaction } from '@app/widgets/faction-editor/defaultFaction';
import { defaultAdvantage, nextLeaderFromLast } from '@app/widgets/faction-editor/factionFormDefaults';

/*
 * The faction the tutorial's creator opens on: the site's default with every text the tutorial asks for left blank
 * and no supporting leaders, so the learner writes each one and adds their own leader (Norbert, 2026-11-02).
 */
export const blankFaction: Faction = {
  ...defaultFaction,
  name: '',
  factionLeader: { ...defaultFaction.factionLeader, name: '' },
  leaders: [],
  troops: defaultFaction.troops.map((troop) => ({ ...troop, name: '' })),
  rules: {
    ...defaultFaction.rules,
    startText: '',
    revivalText: '',
    alliance: { ...defaultFaction.rules.alliance, text: '' },
    fate: { ...defaultFaction.rules.fate, text: '' },
  },
};

/*
 * The faction a later step opens on (`?step`): what the tasks before it would have made, where a task needs it to
 * exist. A leader to name, an advantage to write, and a name so Save can be pressed.
 */
export function draftAfter(done: readonly string[]): Faction {
  const did = (id: string) => done.includes(id);
  return {
    ...blankFaction,
    name: did('name') ? 'Sand Wardens' : blankFaction.name,
    leaders: did('add-leader') ? [nextLeaderFromLast(undefined)] : blankFaction.leaders,
    rules: {
      ...blankFaction.rules,
      advantages: did('add-advantage') ? [defaultAdvantage()] : blankFaction.rules.advantages,
    },
  };
}
