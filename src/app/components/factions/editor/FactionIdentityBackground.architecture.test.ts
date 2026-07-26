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
const identityStyles = readFileSync(
  new URL('./FactionFormSectionIdentity.module.css', import.meta.url),
  'utf8'
);
const backgroundStyles = readFileSync(
  new URL('./FactionFormSectionBackground.module.css', import.meta.url),
  'utf8'
);
const editorStyles = readFileSync(new URL('./FactionEditor.module.css', import.meta.url), 'utf8');
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
    expect(fieldsSource).toContain('data-faction-token-proof');
    expect(fieldsSource).toContain('component="section"');
    expect(fieldsSource).toContain('live preview');
    expect(fieldsSource).not.toContain('className={styles.artifactColumn} visibleFrom="sm"');
    expect(fieldsSource.indexOf('{artifact}')).toBeLessThan(
      fieldsSource.indexOf('className={styles.sheetColorReference}')
    );
    expect(editorStyles).toContain('.identityProof .squareProof');
    expect(editorStyles).toContain('aspect-ratio: 1');
    expect(rendererSource).not.toContain('@mantine');
  });

  it('uses one compact TTS row surface, unique choices, and heading-level add/remove actions', () => {
    expect(ttsColorsSource).toContain('TTS_COLOR_SWATCHES');
    expect(ttsColorsSource).toContain("color === 'White'");
    expect(ttsColorsSource).toContain('leftSection={<ColorDot');
    expect(ttsColorsSource).toContain('renderOption=');
    expect(ttsColorsSource).toContain('availableTtsColors');
    expect(ttsColorsSource).toContain('nextUnusedTtsColor');
    expect(ttsColorsSource).toContain('<ListLengthActions');
    expect(ttsColorsSource).toContain('removeLabel="Remove last TTS color"');
    expect(ttsColorsSource).toContain('addLabel="Add TTS color"');
    expect(ttsColorsSource).not.toContain('<ActionIcon.Group>');
    expect(ttsColorsSource).toContain('PointerSensor');
    expect(ttsColorsSource).toContain('KeyboardSensor');
    expect(ttsColorsSource).toContain('sortableKeyboardCoordinates');
    expect(ttsColorsSource).not.toContain('Repeated colors are allowed');
    expect(ttsColorsSource).not.toContain('Order:');
  });

  it('uses the accepted perceptual influence mapping and labels without changing Definition', () => {
    expect(backgroundSource).toContain('influenceToSliderPosition');
    expect(backgroundSource).toContain('sliderPositionToInfluence');
    for (const label of ['Whisper', 'Strong', 'Dominant']) {
      expect(backgroundSource).toContain(label);
    }
    expect(backgroundSource).toContain('name="background.definition"');
    expect(backgroundSource).toContain('max={1}');
    expect(backgroundSource).toContain('step={0.01}');
  });

  it('compacts chapter internals from the connected panel container', () => {
    expect(identityStyles).toContain('@container connected-tabs-panel');
    expect(backgroundStyles).toContain('@container connected-tabs-panel');
    expect(identityStyles).not.toContain('@media');
    expect(backgroundStyles).not.toContain('@media');
  });

  it('uses one outer separator around the open pattern catalogue', () => {
    expect(backgroundSource).toContain('<Divider />');
    expect(backgroundStyles).not.toContain('border-block:');
  });
});
