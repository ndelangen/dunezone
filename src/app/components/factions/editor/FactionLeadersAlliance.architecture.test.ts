import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const heroSource = readFileSync(new URL('./FactionFormSectionHero.tsx', import.meta.url), 'utf8');
const leadersSource = readFileSync(
  new URL('./FactionFormSectionLeaders.tsx', import.meta.url),
  'utf8'
);
const allianceSource = readFileSync(
  new URL('./FactionFormSectionAlliance.tsx', import.meta.url),
  'utf8'
);
const fieldsSource = readFileSync(new URL('./FactionFormFields.tsx', import.meta.url), 'utf8');
const collectionShelfSource = readFileSync(
  new URL('./FactionCollectionShelf.tsx', import.meta.url),
  'utf8'
);

const retiredPresentationImports = [
  '@app/components/form/',
  '@app/components/generic/',
  'Accordion',
  'Modal',
  'ScrollArea',
];

describe('Leaders and Alliance authoring architecture', () => {
  it('gives the faction leader and ordered supporting roster separate tabs with one shared proof', () => {
    expect(fieldsSource).toContain('<FactionFormSectionHero form={form} showPreview={false} />');
    expect(fieldsSource).toContain('<FactionFormSectionLeaders');
    expect(fieldsSource).toContain('<LeaderToken');
    expect(heroSource).toContain('<LeaderToken');
    expect(leadersSource).toContain('<LeaderToken');
    expect(heroSource).toContain('Used on: Faction shield');
    expect(leadersSource).toContain('Used as: leader token');
    expect(heroSource).toContain('visibleFrom="sm"');
    expect(leadersSource).toContain('visibleFrom="sm"');
  });

  it('supports pointer and keyboard ordering and prevents adding an eleventh leader', () => {
    expect(leadersSource).toContain('<FactionCollectionShelf');
    expect(collectionShelfSource).toContain('PointerSensor');
    expect(collectionShelfSource).toContain('KeyboardSensor');
    expect(collectionShelfSource).toContain('sortableKeyboardCoordinates');
    expect(leadersSource).toContain('SUPPORTING_LEADER_LIMIT = 10');
    expect(leadersSource).toContain('disabled={!canAdd}');
    expect(leadersSource).toContain('Most factions use five supporting leaders');
  });

  it('owns alliance ability and every decal field beside the real alliance card', () => {
    expect(fieldsSource).toContain('<FactionFormSectionAlliance');
    expect(fieldsSource).not.toContain('FactionFormSectionDecals');
    expect(fieldsSource).not.toContain('part="alliance"');
    expect(allianceSource).toContain('name="rules.alliance.text"');
    expect(allianceSource).toContain('name="decals" mode="array"');
    expect(allianceSource).toContain('.id`');
    expect(allianceSource).toContain('.muted`');
    expect(allianceSource).toContain('.outline`');
    expect(allianceSource).toContain('.scale`');
    expect(allianceSource).toContain('.offset[0]`');
    expect(allianceSource).toContain('.offset[1]`');
    expect(fieldsSource).toContain('<AllianceCard');
    expect(allianceSource).toContain('visibleFrom="sm"');
    expect(allianceSource).toContain('<FactionCollectionShelf');
  });

  it('keeps application presentation in Mantine and renderers isolated', () => {
    for (const source of [heroSource, leadersSource, allianceSource]) {
      for (const retiredImport of retiredPresentationImports) {
        expect(source).not.toContain(retiredImport);
      }
    }
    expect(heroSource).toContain("from '@mantine/core'");
    expect(leadersSource).toContain("from '@mantine/core'");
    expect(allianceSource).toContain("from '@mantine/core'");
  });
});
