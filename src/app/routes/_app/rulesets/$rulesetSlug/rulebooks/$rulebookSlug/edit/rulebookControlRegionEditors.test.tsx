import { rulebookLayoutCatalogue } from '@shared/rulebooks/contents';
import type { ComponentProps } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { rulebookControlRegionEditors } from './rulebookControlRegionEditors';
import type { RulebookControlRegionEditorProps, RulebookControlRegionKey } from './rulebookControlRegionEditors';

type CoverEditorProps = ComponentProps<(typeof rulebookControlRegionEditors)['cover']['cover']>;
type CoverFooterEditorProps = ComponentProps<(typeof rulebookControlRegionEditors)['cover']['footer']>;

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
    expectTypeOf<'content'>().not.toExtend<RulebookControlRegionKey<'single-column'>>();
    expectTypeOf<'column1'>().not.toExtend<RulebookControlRegionKey<'two-columns'>>();
    expectTypeOf<RulebookControlRegionKey<'outer-rail'>>().toBeNever();
  });

  it('keeps every counterpart on its exact Page-owned value type', () => {
    expectTypeOf<CoverEditorProps>().toEqualTypeOf<RulebookControlRegionEditorProps<'cover', 'cover'>>();
    expectTypeOf<CoverFooterEditorProps>().toEqualTypeOf<RulebookControlRegionEditorProps<'cover', 'footer'>>();
  });
});
