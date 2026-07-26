import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const authoringSources = [
  'FactionBackgroundColorLayer.tsx',
  'FactionFormSectionAdvantages.tsx',
  'FactionFormSectionAlliance.tsx',
  'FactionFormSectionBackground.tsx',
  'FactionFormSectionHero.tsx',
  'FactionFormSectionIdentity.tsx',
  'FactionFormSectionLeaders.tsx',
  'FactionFormSectionPlanets.tsx',
  'FactionFormSectionRules.tsx',
  'FactionFormSectionTroops.tsx',
  'TroopSideFields.tsx',
  'TtsColorsEditor.tsx',
].map((file) => ({
  file,
  source: readFileSync(new URL(file, import.meta.url), 'utf8'),
}));

const nativeDescriptiveControl =
  /<(?:ColorInput|NumberInput|Select|Switch|Textarea|TextInput)\b(?:(?!\/>)[\s\S])*?\bdescription=/u;
const rulesSource = authoringSources.find(
  ({ file }) => file === 'FactionFormSectionRules.tsx'
)?.source;

describe('Faction authoring control guidance', () => {
  it('routes descriptive fields through ControlBlock instead of native wrapping descriptions', () => {
    for (const { file, source } of authoringSources) {
      expect(source, file).not.toMatch(nativeDescriptiveControl);
      expect(source, file).not.toContain('<Input.Wrapper');

      if (source.includes('description=')) {
        expect(source, file).toContain('<ControlBlock');
      }
    }
  });

  it('keeps the Rules tab flat and separates setup from Fate with a divider', () => {
    expect(rulesSource).toBeDefined();
    expect(rulesSource).toContain('<Divider my="lg" />');
    expect(rulesSource).not.toContain('<Paper');
    expect(rulesSource).not.toContain('<Alert');
    expect(rulesSource).not.toContain('Keep free-form instructions separate');
    expect(rulesSource).not.toContain('Structured setup fact');
    expect(rulesSource).toContain(
      'Rendered in At start as “Starting spice: N”; use a positive whole number.'
    );
  });
});
