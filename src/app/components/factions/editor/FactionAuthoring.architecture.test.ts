import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const formFieldsSource = readFileSync(new URL('./FactionFormFields.tsx', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('./FactionEditor.tsx', import.meta.url), 'utf8');
const toolbarSource = readFileSync(
  new URL('./FactionAuthoringToolbar.tsx', import.meta.url),
  'utf8'
);
const toolbarStyles = readFileSync(
  new URL('./FactionAuthoringToolbar.module.css', import.meta.url),
  'utf8'
);
const collectionShelfSource = readFileSync(
  new URL('./FactionCollectionShelf.tsx', import.meta.url),
  'utf8'
);
const createRouteSource = readFileSync(
  new URL('../../../routes/_app/factions/create.tsx', import.meta.url),
  'utf8'
);
const editRouteSource = readFileSync(
  new URL('../../../routes/_app/factions/$factionId/edit.tsx', import.meta.url),
  'utf8'
);
const editorDirectory = new URL('.', import.meta.url);
const productionEditorSources = readdirSync(editorDirectory)
  .filter(
    (name) => /\.(?:ts|tsx)$/.test(name) && !name.includes('.test.') && !name.includes('.stories.')
  )
  .map((name) => ({
    name,
    source: readFileSync(new URL(name, editorDirectory), 'utf8'),
  }));

describe('faction authoring architecture', () => {
  it('uses one in-memory eight-tab workbench without route or hash state', () => {
    expect(formFieldsSource).toContain('<Tabs');
    expect(formFieldsSource).toContain('factionAuthoringChapters.map');
    expect(formFieldsSource).toContain("useState<FactionAuthoringChapterId>('identity')");
    expect(formFieldsSource).toContain('<ArtifactProof');
    expect(formFieldsSource).not.toContain('Accordion');
    expect(formFieldsSource).not.toContain('useEditorAccordionHash');
    expect(formFieldsSource).not.toContain('navigate(');
  });

  it('keeps one selected collection editor synchronized with the adjacent artifact proof', () => {
    expect(formFieldsSource).toContain('const [selectedItem, setSelectedItem]');
    expect(formFieldsSource).toContain('selectedIndex={selectedItem.leader}');
    expect(formFieldsSource).toContain('selectedIndex={selectedItem.world}');
    expect(formFieldsSource).toContain('selectedIndex={selectedItem.troop}');
    expect(formFieldsSource).toContain('selectedIndex={selectedItem.advantage}');
    expect(formFieldsSource).toContain('faction.leaders[Math.min(selectedItem.leader');
    expect(formFieldsSource).toContain('faction.troops[Math.min(selectedItem.troop');
    expect(formFieldsSource).not.toContain('const firstLeader');
    expect(formFieldsSource).not.toContain('const firstTroop');
  });

  it('keeps save independent from the retired always-on sheet iframe', () => {
    expect(editorSource).not.toContain('FactionSheetPreviewIframe');
    expect(editorSource).toContain('preserveFactionExtras');
    expect(editorSource).toContain('onSubmit(preserveFactionExtras');
  });

  it('removes the replaced editor files and generic presentation imports', () => {
    for (const retiredFile of [
      'FactionFormSectionDecals.tsx',
      'FactionSheetPreviewIframe.tsx',
      'useEditorAccordionHash.ts',
    ]) {
      expect(existsSync(new URL(retiredFile, editorDirectory)), retiredFile).toBe(false);
    }

    for (const { name, source } of productionEditorSources) {
      expect(source, name).not.toContain("from '@app/components/generic/");
      expect(source, name).not.toContain("from '@app/components/form/");
      expect(source, name).not.toContain('window.confirm');
      expect(source, name).not.toContain('window.alert');
    }
  });

  it('shares a Mantine-first sticky toolbar across terminal Create and Edit routes', () => {
    expect(toolbarSource).toContain("from '@mantine/core'");
    expect(toolbarStyles).toContain('position: sticky');
    for (const routeSource of [createRouteSource, editRouteSource]) {
      expect(routeSource).toContain('<PageLayout');
      expect(routeSource).toContain('<FactionAuthoringToolbar');
      expect(routeSource).not.toContain("from '@app/components/generic/layout'");
      expect(routeSource).not.toContain("from '@app/components/generic/ui/UIButton'");
    }
  });

  it('keeps pointer and keyboard ordering in every ordered faction collection', () => {
    expect(collectionShelfSource).toContain('PointerSensor');
    expect(collectionShelfSource).toContain('KeyboardSensor');
    expect(collectionShelfSource).toContain('sortableKeyboardCoordinates');
    expect(collectionShelfSource).toContain('Drag to reorder');

    for (const file of [
      'FactionFormSectionLeaders.tsx',
      'FactionFormSectionTroops.tsx',
      'FactionFormSectionAdvantages.tsx',
      'FactionFormSectionAlliance.tsx',
      'FactionFormSectionPlanets.tsx',
    ]) {
      const source = readFileSync(new URL(file, editorDirectory), 'utf8');
      expect(source, file).toContain('<FactionCollectionShelf');
    }

    const ttsColorsSource = readFileSync(new URL('TtsColorsEditor.tsx', editorDirectory), 'utf8');
    for (const contractPart of [
      'PointerSensor',
      'KeyboardSensor',
      'sortableKeyboardCoordinates',
      'Drag to reorder',
    ]) {
      expect(ttsColorsSource).toContain(contractPart);
    }
  });

  it('does not ship a throwaway prototype route', () => {
    const routeDirectory = new URL('../../../routes/', import.meta.url);
    const routeFiles = readdirSync(routeDirectory, { recursive: true })
      .map(String)
      .filter((name) => /\.(?:ts|tsx)$/.test(name));
    expect(routeFiles.some((name) => name.includes('prototype'))).toBe(false);
    for (const routeFile of routeFiles) {
      const source = readFileSync(new URL(routeFile, routeDirectory), 'utf8');
      expect(source, routeFile).not.toContain('faction-sheet-preview-prototype');
      expect(source, routeFile).not.toContain('THROWAWAY PROTOTYPE');
    }
  });
});
