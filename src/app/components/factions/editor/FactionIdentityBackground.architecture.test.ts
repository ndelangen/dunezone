import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const identitySource = readFileSync(
  new URL('./FactionFormSectionIdentity.tsx', import.meta.url),
  'utf8'
);
const backgroundSource = readFileSync(
  new URL('./FactionFormSectionBackground.tsx', import.meta.url),
  'utf8'
);
const colorLayerSource = readFileSync(
  new URL('./FactionBackgroundColorLayer.tsx', import.meta.url),
  'utf8'
);
const ttsColorsSource = readFileSync(new URL('./TtsColorsEditor.tsx', import.meta.url), 'utf8');
const rendererSource = readFileSync(
  new URL('../../../../game/assets/utils/Background.tsx', import.meta.url),
  'utf8'
);

describe('Identity and Appearance chapter architecture', () => {
  it('uses Mantine directly for application presentation without legacy form consumers', () => {
    for (const source of [identitySource, backgroundSource, colorLayerSource, ttsColorsSource]) {
      expect(source).toContain("from '@mantine/core'");
      expect(source).not.toContain("from '@app/components/form/");
      expect(source).not.toContain("from '@app/components/generic/");
    }
  });

  it('presents the complete visible background pipeline and inline pattern library', () => {
    for (const label of [
      'Pattern',
      'Treatment',
      'Base + pattern colors',
      'Definition',
      'Influence',
    ]) {
      expect(backgroundSource).toContain(label);
    }
    expect(backgroundSource).toContain('BACKGROUND_PATTERN_CATALOGUE');
    expect(backgroundSource).toContain('Random all');
    expect(backgroundSource).toContain('patternScroller');
    expect(backgroundSource).not.toContain('Modal');
    expect(backgroundSource).not.toContain('ScrollArea');
  });

  it('uses the renderer treatment contract for the selected monochrome pattern proof', () => {
    expect(backgroundSource).toContain(
      "import { backgroundTreatment } from '@game/assets/utils/Background'"
    );
    expect(backgroundSource).toContain('const treatment = backgroundTreatment(background)');
    expect(backgroundSource).toContain('filter: treatment.patternFilter');
    expect(backgroundSource).toContain('opacity: treatment.patternOpacity');
    expect(backgroundSource).not.toContain('0.25 + background.influence');
  });

  it('supports every admitted color-layer mode and uncommon geometry/stop controls', () => {
    for (const field of [
      'Solid',
      'Linear',
      'Radial',
      'Gradient angle',
      'Center X',
      'Center Y',
      'Radius',
    ]) {
      expect(colorLayerSource).toContain(field);
    }
    expect(colorLayerSource).toContain('Add stop');
    expect(colorLayerSource).toContain('Move stop');
    expect(colorLayerSource).toContain('Remove stop');
  });

  it('keeps the composite proof in the shared desktop artifact desk', () => {
    const fieldsSource = readFileSync(new URL('./FactionFormFields.tsx', import.meta.url), 'utf8');
    expect(fieldsSource).toContain('BackgroundRenderer');
    expect(fieldsSource).toContain('<Token');
    expect(fieldsSource).toContain('visibleFrom="sm"');
    expect(rendererSource).not.toContain('@mantine');
  });

  it('shows dots for TTS options and selected values while retaining keyboard ordering', () => {
    expect(ttsColorsSource).toContain('TTS_COLOR_SWATCHES');
    expect(ttsColorsSource).toContain("color === 'White'");
    expect(ttsColorsSource).toContain('leftSection={<ColorDot');
    expect(ttsColorsSource).toContain('renderOption=');
    expect(ttsColorsSource).toContain('PointerSensor');
    expect(ttsColorsSource).toContain('KeyboardSensor');
    expect(ttsColorsSource).toContain('sortableKeyboardCoordinates');
    expect(ttsColorsSource).toContain('Repeated colors are allowed');
  });
});
