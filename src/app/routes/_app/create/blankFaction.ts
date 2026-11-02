import type { Faction } from '@db/factions';
import { defaultFaction } from '@app/widgets/faction-editor/defaultFaction';

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
    alliance: { ...defaultFaction.rules.alliance, text: '' },
  },
};
