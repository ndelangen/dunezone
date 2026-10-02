import { phaseDeclarationProblems } from '@shared/factions/extraPhases';

import type { Faction } from '@db/factions';

export const factionAuthoringChapters = [
  { id: 'identity', label: 'Identity & Appearance' },
  { id: 'leader', label: 'Faction leader' },
  { id: 'leaders', label: 'Leaders' },
  /* Two ordering dependencies: Planets precedes Forces because a troop's planet
     reference selects among the planets, and Forces precedes Alliance because
     the alliance card's proof needs at least one troop type. The internal
     chapter id stays `worlds`; only the label says Planets. */
  { id: 'worlds', label: 'Planets' },
  { id: 'forces', label: 'Forces' },
  { id: 'alliance', label: 'Alliance' },
  { id: 'rules', label: 'Rules' },
  { id: 'advantages', label: 'Advantages' },
  { id: 'phases', label: 'Phases' },
  { id: 'extras', label: 'Extras' },
  { id: 'complexity', label: 'Complexity' },
] as const;

export type FactionAuthoringChapterId = (typeof factionAuthoringChapters)[number]['id'];

/**
 * The two shapes `ValidationHeader` already accepts, which is why this union rather than a `missing` string alone: most gaps are an absence ("missing a name"), but a name conflict is a whole complaint about a value that is present.
 */
export type FactionAuthoringWarning = {
  path: string;
  chapter: FactionAuthoringChapterId;
  label: string;
  targetId: string;
  /** The entity the gap belongs to; the validation header renders one chip per source. */
  source: string;
} & (
  | {
      /** What the source is missing, e.g. "name" or "back description". */
      missing: string;
      complaint?: never;
    }
  | {
      /** A whole complaint about the source, e.g. "its name is already taken". */
      complaint: string;
      missing?: never;
    }
);

function isBlank(value: string | undefined): boolean {
  return value == null || value.trim().length === 0;
}

function warning(
  path: string,
  chapter: FactionAuthoringChapterId,
  source: string,
  missing: string,
  targetId: string
): FactionAuthoringWarning {
  return { path, chapter, label: `${source}: missing ${missing}`, targetId, source, missing };
}

/**
 * The name-conflict warning, built where the other faction warnings are so its shape cannot drift from theirs.
 * It carries a complaint rather than a `missing`, because the name is present;
 * it is the address behind it that is taken.
 * `targetId` is the name field's own id, so the header's chip focuses the field the author has to change.
 */
export function factionNameConflictWarning(complaint: string): FactionAuthoringWarning {
  return {
    path: 'name',
    chapter: 'identity',
    label: `Faction identity: ${complaint}`,
    targetId: 'faction-name',
    source: 'Faction identity',
    complaint,
  };
}

/** Schema-valid blanks that are probably accidental, but never prevent an explicit save. */
export function factionAuthoringWarnings(faction: Faction): FactionAuthoringWarning[] {
  const warnings: FactionAuthoringWarning[] = [];

  if (isBlank(faction.leader.name)) {
    warnings.push(warning('leader.name', 'leader', 'Faction leader', 'name', 'leader-name'));
  }
  faction.leaders.forEach((leader, index) => {
    if (isBlank(leader.name)) {
      warnings.push(
        warning(`leaders[${index}].name`, 'leaders', `Leader ${index + 1}`, 'name', `leader-${index}-name`)
      );
    }
  });

  if (isBlank(faction.rules.alliance.text)) {
    warnings.push(warning('rules.alliance.text', 'alliance', 'Alliance', 'ability text', 'rules-alliance'));
  }

  faction.troops.forEach((troop, index) => {
    const source = `Troop ${index + 1}`;
    if (isBlank(troop.name)) {
      warnings.push(warning(`troops[${index}].name`, 'forces', source, 'name', `troop-${index}-name`));
    }
    if (isBlank(troop.description)) {
      warnings.push(warning(`troops[${index}].description`, 'forces', source, 'description', `troop-${index}-desc`));
    }
    if (troop.back && isBlank(troop.back.name)) {
      warnings.push(
        warning(`troops[${index}].back.name`, 'forces', source, 'back-side name', `troop-${index}-back-name`)
      );
    }
    if (troop.back && isBlank(troop.back.description)) {
      warnings.push(
        warning(
          `troops[${index}].back.description`,
          'forces',
          source,
          'back-side description',
          `troop-${index}-back-desc`
        )
      );
    }
  });
  faction.planet?.forEach((planet, index) => {
    const source = `Planet ${index + 1}`;
    if (isBlank(planet.name)) {
      warnings.push(warning(`planet[${index}].name`, 'worlds', source, 'name', `planet-${index}-name`));
    }
    if (isBlank(planet.description)) {
      warnings.push(
        warning(`planet[${index}].description`, 'worlds', source, 'description', `planet-${index}-description`)
      );
    }
  });

  if (isBlank(faction.rules.startText)) {
    warnings.push(warning('rules.startText', 'rules', 'Rules', 'starting instructions', 'rules-start'));
  }
  if (isBlank(faction.rules.revivalText)) {
    warnings.push(warning('rules.revivalText', 'rules', 'Rules', 'revival instructions', 'rules-revival'));
  }
  if (isBlank(faction.rules.fate.text)) {
    warnings.push(warning('rules.fate.text', 'rules', 'Rules', 'fate text', 'rules-fate-text'));
  }
  faction.rules.advantages.forEach((advantage, index) => {
    if (isBlank(advantage.text)) {
      warnings.push(
        warning(
          `rules.advantages[${index}].text`,
          'advantages',
          `Advantage ${index + 1}`,
          'rule text',
          `adv-${index}-text`
        )
      );
    }
  });

  return warnings;
}

/** The number of phase rows the shared schema refuses; any one of them holds Save. */
export function invalidPhaseRowCount(faction: Faction): number {
  return (faction.extraPhases ?? []).filter((row) => Object.keys(phaseDeclarationProblems(row)).length > 0).length;
}

type FactionAuthoringCoverageState = 'control' | 'derived' | 'preserved';

type CoverageEntry = {
  state: FactionAuthoringCoverageState;
  chapter?: FactionAuthoringChapterId;
  owner?: string;
};

function coverage(paths: readonly string[], entry: CoverageEntry): Record<string, CoverageEntry> {
  return Object.fromEntries(paths.map((path) => [path, entry]));
}

/**
 * Leaf-path coverage for FactionInputSchema.
 *
 * A non-control leaf must identify its owner: `derived` values are generated at the save boundary;
 * `preserved` values round-trip unchanged.
 * There is no temporary/planned state.
 */
export const factionAuthoringCoverage: Readonly<Record<string, CoverageEntry>> = {
  ...coverage(['leader.memberId', 'leaders[].memberId'], {
    state: 'preserved',
    owner: 'Persistent faction member identity assigned on creation and import',
  }),
  ...coverage(['troops[].troopId'], {
    state: 'preserved',
    owner: 'Persistent troop identity assigned on creation and import (#1227)',
  }),
  ...coverage(['name', 'logo', 'themeColor', 'colors[]'], {
    state: 'control',
    chapter: 'identity',
  }),
  ...coverage(
    [
      'background.image',
      'background.invert',
      'background.definition',
      'background.influence',
      'background.colors[0]',
      'background.colors[0].type',
      'background.colors[0].angle',
      'background.colors[0].x',
      'background.colors[0].y',
      'background.colors[0].r',
      'background.colors[0].stops[][0]',
      'background.colors[0].stops[][1]',
      'background.colors[1]',
      'background.colors[1].type',
      'background.colors[1].angle',
      'background.colors[1].x',
      'background.colors[1].y',
      'background.colors[1].r',
      'background.colors[1].stops[][0]',
      'background.colors[1].stops[][1]',
    ],
    { state: 'control', chapter: 'identity' }
  ),
  ...coverage(['leader.name', 'leader.image'], { state: 'control', chapter: 'leader' }),
  ...coverage(['leaders[].name', 'leaders[].strength', 'leaders[].image'], {
    state: 'control',
    chapter: 'leaders',
  }),
  ...coverage(
    [
      'rules.alliance.text',
      'decals[].id',
      'decals[].muted',
      'decals[].outline',
      'decals[].scale',
      'decals[].offset[0]',
      'decals[].offset[1]',
    ],
    { state: 'control', chapter: 'alliance' }
  ),
  ...coverage(
    [
      'troops[].image',
      'troops[].name',
      'troops[].description',
      'troops[].star',
      'troops[].hue',
      'troops[].striped',
      'troops[].back.image',
      'troops[].back.name',
      'troops[].back.description',
      'troops[].back.star',
      'troops[].back.hue',
      'troops[].back.striped',
      'troops[].capable',
      'troops[].combat.strength',
      'troops[].combat.fundedStrength',
      'troops[].combat.fundingCost',
      'troops[].back.capable',
      'troops[].back.combat.strength',
      'troops[].back.combat.fundedStrength',
      'troops[].back.combat.fundingCost',
      'troops[].count',
    ],
    { state: 'control', chapter: 'forces' }
  ),
  ...coverage(['troops[].planet'], {
    state: 'control',
    chapter: 'forces',
  }),
  ...coverage(['planet[].image', 'planet[].name', 'planet[].description'], {
    state: 'control',
    chapter: 'worlds',
  }),
  ...coverage(['rules.startText', 'rules.revivalText', 'rules.spiceCount', 'rules.fate.title', 'rules.fate.text'], {
    state: 'control',
    chapter: 'rules',
  }),
  ...coverage(['rules.advantages[].title', 'rules.advantages[].text', 'rules.advantages[].karama'], {
    state: 'control',
    chapter: 'advantages',
  }),
  ...coverage(
    [
      'extraPhases[].type',
      'extraPhases[].title',
      'extraPhases[].symbol',
      'extraPhases[].before',
      'extraPhases[].priority',
      'extraPhases[].allPlayersMustBeReady',
      'extraPhases[].instructions',
    ],
    { state: 'control', chapter: 'phases' }
  ),
  ...coverage(['extraPhases[].id'], {
    state: 'preserved',
    owner: 'Phase declaration identity generated when the author adds a row, never shown',
  }),
  ...coverage(['complexity.manual'], { state: 'control', chapter: 'complexity' }),
  ...coverage(['complexity.calculated'], {
    state: 'derived',
    owner: 'Shared faction-complexity calculation at the create and update boundary',
  }),
  ...coverage(['extras[].type', 'extras[].slug'], { state: 'control', chapter: 'extras' }),
};
