import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const fieldsSource = readFileSync(new URL('./FactionFormFields.tsx', import.meta.url), 'utf8');
const troopsSource = readFileSync(
  new URL('./FactionFormSectionTroops.tsx', import.meta.url),
  'utf8'
);
const troopSideSource = readFileSync(new URL('./TroopSideFields.tsx', import.meta.url), 'utf8');
const planetsSource = readFileSync(
  new URL('./FactionFormSectionPlanets.tsx', import.meta.url),
  'utf8'
);
const rulesSource = readFileSync(new URL('./FactionFormSectionRules.tsx', import.meta.url), 'utf8');
const advantagesSource = readFileSync(
  new URL('./FactionFormSectionAdvantages.tsx', import.meta.url),
  'utf8'
);
const collectionShelfSource = readFileSync(
  new URL('./FactionCollectionShelf.tsx', import.meta.url),
  'utf8'
);

describe('Forces and Worlds and Rules and Advantages chapter architecture', () => {
  it('gives worlds, forces, rules, and advantages separate main tabs', () => {
    for (const chapter of [
      "chapter === 'worlds'",
      "chapter === 'forces'",
      "chapter === 'rules'",
      "chapter === 'advantages'",
    ]) {
      expect(fieldsSource).toContain(chapter);
    }
    expect(fieldsSource).toContain('<FactionFormSectionPlanets');
    expect(fieldsSource).toContain('<FactionFormSectionTroops');
    expect(fieldsSource).toContain('<FactionFormSectionRules form={form}');
    expect(fieldsSource).toContain('<FactionFormSectionAdvantages');
  });

  it('uses Mantine directly for the newly owned application presentation', () => {
    for (const source of [
      troopsSource,
      troopSideSource,
      planetsSource,
      advantagesSource,
      rulesSource,
    ]) {
      expect(source).toContain("from '@mantine/core'");
      expect(source).not.toContain("from '@app/components/generic/ui");
    }
    for (const source of [troopsSource, troopSideSource, planetsSource, advantagesSource]) {
      expect(source).not.toContain("from '@app/components/form/");
    }
  });

  it('preserves pointer and keyboard ordering for troops, planets, and advantages', () => {
    expect(collectionShelfSource).toContain('PointerSensor');
    expect(collectionShelfSource).toContain('KeyboardSensor');
    expect(collectionShelfSource).toContain('sortableKeyboardCoordinates');
    expect(collectionShelfSource).toContain('Drag to reorder');
    for (const source of [troopsSource, planetsSource, advantagesSource]) {
      expect(source).toContain('<FactionCollectionShelf');
    }
  });

  it('uses only the informative troop renderer and removes previews on mobile', () => {
    expect(troopsSource).toContain('TroopToken');
    expect(troopsSource).toContain('visibleFrom="sm"');
    expect(planetsSource).toContain('To be implemented later');
    expect(planetsSource).not.toContain('@game/assets/');
    expect(planetsSource).not.toContain('PlanetToken');
  });

  it('does not introduce modal, accordion, or nested scrolling chapter UI', () => {
    for (const source of [troopsSource, planetsSource, rulesSource, advantagesSource]) {
      expect(source).not.toContain('Modal');
      expect(source).not.toContain('Accordion');
      expect(source).not.toContain('ScrollArea');
    }
  });
});
