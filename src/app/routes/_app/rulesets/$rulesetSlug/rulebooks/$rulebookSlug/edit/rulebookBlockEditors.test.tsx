import { rulebookBlockKinds } from '@shared/rulebooks/contents';
import type { RulebookBlockKind } from '@shared/rulebooks/contents';
import type { ComponentProps } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { rulebookBlockEditors } from './rulebookBlockEditors';
import type { RulebookBlockEditorProps } from './rulebookBlockEditors';

type RegisteredEditorProps<Kind extends RulebookBlockKind> = ComponentProps<(typeof rulebookBlockEditors)[Kind]>;

describe('Rulebook Block editor registry', () => {
  it('has one counterpart for every Block kind', () => {
    expect(Object.keys(rulebookBlockEditors).sort()).toEqual([...rulebookBlockKinds].sort());
    expectTypeOf<keyof typeof rulebookBlockEditors>().toEqualTypeOf<RulebookBlockKind>();
  });

  it('keeps every counterpart on its exact value type', () => {
    expectTypeOf<RegisteredEditorProps<'text'>>().toEqualTypeOf<RulebookBlockEditorProps<'text'>>();
    expectTypeOf<RegisteredEditorProps<'list'>>().toEqualTypeOf<RulebookBlockEditorProps<'list'>>();
    expectTypeOf<RegisteredEditorProps<'reference-table'>>().toEqualTypeOf<
      RulebookBlockEditorProps<'reference-table'>
    >();
    expectTypeOf<RegisteredEditorProps<'credits'>>().toEqualTypeOf<RulebookBlockEditorProps<'credits'>>();
  });
});
