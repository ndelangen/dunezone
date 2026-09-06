import { rulebookBlockKinds } from '@shared/rulebooks/contents';
import type { RulebookBlockKind } from '@shared/rulebooks/contents';
import type { ComponentProps } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { rulebookBlockEditors } from './rulebookBlockEditors';
import type { RulebookBlockEditorProps } from './rulebookBlockEditors';

type RegisteredEditorProps<Kind extends RulebookBlockKind> = ComponentProps<(typeof rulebookBlockEditors)[Kind]>;

describe('Rulebook Block editor registry', () => {
  it('has one counterpart for every Block kind', () => {
    expect(Object.keys(rulebookBlockEditors)).toEqual(rulebookBlockKinds);
    expectTypeOf<keyof typeof rulebookBlockEditors>().toEqualTypeOf<RulebookBlockKind>();
  });

  it('keeps every counterpart on its exact value type', () => {
    expectTypeOf<RegisteredEditorProps<'text'>>().toEqualTypeOf<RulebookBlockEditorProps<'text'>>();
    expectTypeOf<RegisteredEditorProps<'repeated-text'>>().toEqualTypeOf<RulebookBlockEditorProps<'repeated-text'>>();
    expectTypeOf<RegisteredEditorProps<'rule-group'>>().toEqualTypeOf<RulebookBlockEditorProps<'rule-group'>>();
    expectTypeOf<RegisteredEditorProps<'asset-figure'>>().toEqualTypeOf<RulebookBlockEditorProps<'asset-figure'>>();
  });
});
