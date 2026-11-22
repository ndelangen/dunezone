import { INHERITABLE_FIELDS } from '@shared/factions/variantFields';
import { slugify } from '@shared/slugify';

import { ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';
import { withRulesets } from '@app/routes/battleWheel.stories.fixture';

/*
 * The base game's six factions as Play's product fixture captures them from production, two of them with variants.
 * The variants are seeded rows, so the pickers' own queries name and count them as they do on the site.
 * The other four have one variant each, which a picker never names.
 */
const VARIANTS = [
  { faction: 'house-atreides', name: 'Dreamrules' },
  { faction: 'house-atreides', name: 'Tournament play with the Kwisatz Haderach' },
  { faction: 'house-harkonnen', name: 'Dreamrules' },
] as const;

export function withFactionVariants(baseline: StorybookDatabase) {
  withRulesets(baseline);
  for (const variant of VARIANTS) {
    const original = baseline.factions.find((row) => row.$key === `faction:${variant.faction}`)!;
    const variantSlug = slugify(variant.name);
    baseline.factions.push({
      ...original,
      $key: `faction:${variant.faction}-${variantSlug}`,
      $patch: undefined,
      slug: `${variant.faction}-${variantSlug}`,
      data: structuredClone(original.data),
      variant_name: variant.name,
      variant_slug: variantSlug,
      parent_id: ref(`faction:${variant.faction}`),
      inherited: [...INHERITABLE_FIELDS],
      revision: 0,
    });
  }
  return baseline;
}
