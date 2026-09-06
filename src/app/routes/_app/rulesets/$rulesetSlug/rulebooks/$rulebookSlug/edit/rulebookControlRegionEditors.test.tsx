import { rulebookLayoutCatalogue } from '@shared/rulebooks/contents';
import type { ComponentProps } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { rulebookControlRegionEditors } from './rulebookControlRegionEditors';
import type { RulebookControlRegionEditorProps, RulebookControlRegionKey } from './rulebookControlRegionEditors';

type ChapterLabelEditorProps = ComponentProps<(typeof rulebookControlRegionEditors)['chapter-opener']['chapter-label']>;
type PageGuidanceEditorProps = ComponentProps<(typeof rulebookControlRegionEditors)['rules-page']['guidance']>;

describe('Rulebook Control-region editor registry', () => {
  it('has one counterpart for every Control region and none for Block regions', () => {
    const expectedKeys = Object.fromEntries(
      rulebookLayoutCatalogue.map((layout) => [
        layout.id,
        layout.regions.filter((region) => region.kind === 'control').map((region) => region.key),
      ])
    );
    const registeredKeys = Object.fromEntries(
      Object.entries(rulebookControlRegionEditors).map(([layoutId, editors]) => [layoutId, Object.keys(editors)])
    );

    expect(registeredKeys).toEqual(expectedKeys);
    expectTypeOf<keyof typeof rulebookControlRegionEditors>().toEqualTypeOf<
      (typeof rulebookLayoutCatalogue)[number]['id']
    >();
    expectTypeOf<'feature'>().not.toExtend<RulebookControlRegionKey<'chapter-opener'>>();
    expectTypeOf<'rules'>().not.toExtend<RulebookControlRegionKey<'rules-page'>>();
    expectTypeOf<'examples'>().not.toExtend<RulebookControlRegionKey<'rules-page'>>();
    expectTypeOf<RulebookControlRegionKey<'visual-reference'>>().toBeNever();
  });

  it('keeps every counterpart on its exact Page-owned value type', () => {
    expectTypeOf<ChapterLabelEditorProps>().toEqualTypeOf<
      RulebookControlRegionEditorProps<'chapter-opener', 'chapter-label'>
    >();
    expectTypeOf<PageGuidanceEditorProps>().toEqualTypeOf<RulebookControlRegionEditorProps<'rules-page', 'guidance'>>();
  });
});
