import { defaultParseSearch } from '@tanstack/react-router';
import { describe, expect, it } from 'vite-plus/test';

import { validateGuideSearch } from './navigation';

describe('contributing guide addresses', () => {
  it('lets explicit topic choices override legacy aliases', () => {
    expect(validateGuideSearch(defaultParseSearch('?code=interface&data=lifecycle&ui=membrane'))).toEqual({
      data: 'lifecycle',
      ui: 'membrane',
    });
    expect(validateGuideSearch(defaultParseSearch('?code=data'))).toEqual({ data: 'queries' });
    expect(validateGuideSearch(defaultParseSearch('?glossary=page'))).toEqual({ ui: 'page' });
  });

  it('retains the product-glossary redirect for old board addresses', () => {
    expect(validateGuideSearch(defaultParseSearch('?glossary=board'))).toEqual({ glossary: 'board' });
  });

  it('ignores malformed values without coercing them to strings', () => {
    expect(validateGuideSearch({ code: Object.create(null), glossary: ['structure'], ui: 42 })).toEqual({});
    expect(validateGuideSearch(defaultParseSearch('?code=%7B%22lesson%22%3A%22testing%22%7D&data=unknown'))).toEqual(
      {}
    );
  });
});
