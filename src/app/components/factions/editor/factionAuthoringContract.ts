import type { Faction } from '@db/factions';

export const factionAuthoringChapters = [
  { id: 'identity', label: 'Identity & Appearance' },
  { id: 'hero', label: 'Faction leader' },
  { id: 'leaders', label: 'Leaders' },
  { id: 'alliance', label: 'Alliance' },
  { id: 'worlds', label: 'Worlds' },
  { id: 'forces', label: 'Forces' },
  { id: 'rules', label: 'Rules' },
  { id: 'advantages', label: 'Advantages' },
] as const;

export type FactionAuthoringChapterId = (typeof factionAuthoringChapters)[number]['id'];

export type FactionAuthoringWarning = {
  path: string;
  chapter: FactionAuthoringChapterId;
  label: string;
  targetId: string;
};

function isBlank(value: string | undefined): boolean {
  return value == null || value.trim().length === 0;
}

function warning(
  path: string,
  chapter: FactionAuthoringChapterId,
  label: string,
  targetId: string
): FactionAuthoringWarning {
  return { path, chapter, label, targetId };
}

/** Schema-valid blanks that are probably accidental, but never prevent an explicit save. */
export function factionAuthoringWarnings(faction: Faction): FactionAuthoringWarning[] {
  const warnings: FactionAuthoringWarning[] = [];

  if (isBlank(faction.hero.name)) {
    warnings.push(warning('hero.name', 'hero', 'Faction leader has no name', 'hero-name'));
  }
  faction.leaders.forEach((leader, index) => {
    if (isBlank(leader.name)) {
      warnings.push(
        warning(
          `leaders[${index}].name`,
          'leaders',
          `Supporting leader ${index + 1} has no name`,
          `leader-${index}-name`
        )
      );
    }
  });

  if (isBlank(faction.rules.alliance.text)) {
    warnings.push(
      warning('rules.alliance.text', 'alliance', 'Alliance ability is empty', 'rules-alliance')
    );
  }

  faction.troops.forEach((troop, index) => {
    if (isBlank(troop.name)) {
      warnings.push(
        warning(
          `troops[${index}].name`,
          'forces',
          `Troop ${index + 1} has no name`,
          `troop-${index}-name`
        )
      );
    }
    if (isBlank(troop.description)) {
      warnings.push(
        warning(
          `troops[${index}].description`,
          'forces',
          `Troop ${index + 1} has no description`,
          `troop-${index}-desc`
        )
      );
    }
    if (troop.back && isBlank(troop.back.name)) {
      warnings.push(
        warning(
          `troops[${index}].back.name`,
          'forces',
          `Troop ${index + 1} back has no name`,
          `troop-${index}-back-name`
        )
      );
    }
    if (troop.back && isBlank(troop.back.description)) {
      warnings.push(
        warning(
          `troops[${index}].back.description`,
          'forces',
          `Troop ${index + 1} back has no description`,
          `troop-${index}-back-desc`
        )
      );
    }
  });
  faction.planet?.forEach((planet, index) => {
    if (isBlank(planet.name)) {
      warnings.push(
        warning(
          `planet[${index}].name`,
          'worlds',
          `Planet ${index + 1} has no name`,
          `planet-${index}-name`
        )
      );
    }
    if (isBlank(planet.description)) {
      warnings.push(
        warning(
          `planet[${index}].description`,
          'worlds',
          `Planet ${index + 1} has no description`,
          `planet-${index}-description`
        )
      );
    }
  });

  if (isBlank(faction.rules.startText)) {
    warnings.push(
      warning('rules.startText', 'rules', 'Starting instructions are empty', 'rules-start')
    );
  }
  if (isBlank(faction.rules.revivalText)) {
    warnings.push(
      warning('rules.revivalText', 'rules', 'Revival instructions are empty', 'rules-revival')
    );
  }
  if (isBlank(faction.rules.fate.text)) {
    warnings.push(warning('rules.fate.text', 'rules', 'Fate text is empty', 'rules-fate-text'));
  }
  faction.rules.advantages.forEach((advantage, index) => {
    if (isBlank(advantage.text)) {
      warnings.push(
        warning(
          `rules.advantages[${index}].text`,
          'advantages',
          `Advantage ${index + 1} has no text`,
          `adv-${index}-text`
        )
      );
    }
  });

  return warnings;
}

/** The editor never owns extras while their domain model is unsettled. */
export function preserveFactionExtras(values: Faction, baseline: Faction): Faction {
  const next = structuredClone(values);
  if (baseline.extras === undefined) {
    delete next.extras;
  } else {
    next.extras = structuredClone(baseline.extras);
  }
  return next;
}

export type FactionAuthoringCoverageState = 'control' | 'preserved';

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
 * `preserved` is the sole product-approved no-control exception. There is no
 * temporary/planned state: every newly admitted schema leaf must ship with a
 * domain control or fail this contract until an explicit exception is approved.
 */
export const factionAuthoringCoverage: Readonly<Record<string, CoverageEntry>> = {
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
  ...coverage(['hero.name', 'hero.image'], { state: 'control', chapter: 'hero' }),
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
      'troops[].striped',
      'troops[].back.image',
      'troops[].back.name',
      'troops[].back.description',
      'troops[].back.star',
      'troops[].back.striped',
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
  ...coverage(
    [
      'rules.startText',
      'rules.revivalText',
      'rules.spiceCount',
      'rules.fate.title',
      'rules.fate.text',
    ],
    { state: 'control', chapter: 'rules' }
  ),
  ...coverage(
    ['rules.advantages[].title', 'rules.advantages[].text', 'rules.advantages[].karama'],
    { state: 'control', chapter: 'advantages' }
  ),
  ...coverage(
    [
      'extras[].name',
      'extras[].description',
      'extras[].items[].url',
      'extras[].items[].description',
    ],
    {
      state: 'preserved',
      owner: 'Intentional extras exception in the faction authoring contract',
    }
  ),
};
