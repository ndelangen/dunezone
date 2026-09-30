import { describe, expect, test } from 'vitest';

import {
  draftInitial,
  draftReducer,
  mediaEntries,
  reclassificationPrompt,
  validateMediaSearch,
} from './mediaCatalogue';

const first = mediaEntries[0]!;
const second = mediaEntries.find((entry) => entry.value !== first.value)!;

describe('media catalogue draft', () => {
  test('moves a bulk selection once and restores the previous assignments with undo', () => {
    let draft = draftReducer(draftInitial, {
      type: 'selectMany',
      values: [first.value, second.value, first.value, '/missing.svg'],
    });
    expect(draft.selected).toEqual([first.value, second.value]);
    draft = draftReducer(draft, { type: 'destination', value: '  Review / Equipment  ' });
    draft = draftReducer(draft, { type: 'move' });
    expect(draft.moves).toEqual({ [first.value]: 'Review / Equipment', [second.value]: 'Review / Equipment' });
    expect(draft.history).toHaveLength(1);
    expect(draftReducer(draft, { type: 'move' })).toBe(draft);
    draft = draftReducer(draft, { type: 'undo' });
    expect(draft.moves).toEqual({});
    expect(draft.selected).toEqual([first.value, second.value]);
  });

  test('moving back to the original group removes the proposal and can itself be undone', () => {
    let draft = draftReducer(draftInitial, { type: 'select', value: first.value });
    draft = draftReducer(draft, { type: 'destination', value: 'Proposed group' });
    draft = draftReducer(draft, { type: 'move' });
    draft = draftReducer(draft, { type: 'destination', value: first.collection });
    draft = draftReducer(draft, { type: 'move' });
    expect(draft.moves).toEqual({});
    expect(draftReducer(draft, { type: 'undo' }).moves).toEqual({ [first.value]: 'Proposed group' });
    expect(draftReducer(draft, { type: 'reset' })).toEqual(draftInitial);
    expect(draftInitial.moves).toEqual({});
  });

  test('does not select unknown assets or create empty destination groups', () => {
    expect(draftReducer(draftInitial, { type: 'select', value: '/missing.svg' })).toBe(draftInitial);
    expect(draftReducer(draftInitial, { type: 'toggle', value: '/missing.svg' })).toBe(draftInitial);
    let draft = draftReducer(draftInitial, { type: 'toggle', value: first.value });
    draft = draftReducer(draft, { type: 'destination', value: '  ' });
    expect(draftReducer(draft, { type: 'move' })).toBe(draft);
    expect(draftReducer(draft, { type: 'toggle', value: first.value }).selected).toEqual([]);
  });
});

describe('media reclassification prompt', () => {
  test('quotes paths and group names, skips unchanged or stale entries, and has deterministic order', () => {
    const destination = 'Court / "New"\nPeople';
    const moves = { [first.value]: destination, [second.value]: 'Second group', '/missing.svg': 'Stale' };
    const prompt = reclassificationPrompt([second, first], moves, '  Preserve the original colors.  ');
    expect(prompt).toBe(reclassificationPrompt([first, second], moves, 'Preserve the original colors.'));
    const changes = JSON.parse(prompt.split('```json\n')[1]!.split('\n```')[0]!);
    expect(changes).toContainEqual({ asset: first.value, from: first.collection, to: destination });
    expect(changes).toHaveLength(2);
    expect(prompt).not.toContain('/missing.svg');
    expect(prompt).toContain('Additional notes:\nPreserve the original colors.');
    expect(reclassificationPrompt([first], { [first.value]: first.collection }, '')).toBe('');
    expect(reclassificationPrompt([first], { [first.value]: '   ', '/missing.svg': 'Elsewhere' }, '')).toBe('');
  });
});

describe('media catalogue deep links', () => {
  test('keeps valid filters and a known selected asset', () => {
    expect(
      validateMediaSearch({ source: 'media', kind: first.kind, group: '  Weapons  ', q: 'sword ', item: first.value })
    ).toEqual({ source: 'media', kind: first.kind, group: 'Weapons', q: 'sword ', item: first.value });
  });

  test('discards malformed filters and unknown selected assets without throwing', () => {
    expect(validateMediaSearch(null)).toEqual({ source: 'media', kind: 'all', group: '', q: '' });
    expect(validateMediaSearch({ source: [], kind: 'unknown', group: {}, q: 12, item: '/missing.svg' })).toEqual({
      source: 'media',
      kind: 'all',
      group: '',
      q: '',
    });
    expect(validateMediaSearch({ source: 'lucide', item: first.value }).item).toBeUndefined();
  });
});
