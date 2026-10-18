import { describe, expect, it } from 'vite-plus/test';

import { boardHighlightTints } from './boardHighlightTints';

describe('boardHighlightTints', () => {
  it('keeps one tint per colour, with group parts as territory types and other parts as territory IDs', () => {
    expect(
      boardHighlightTints([
        { territory: 'funeral-plain', color: '#E9BB42', opacity: 0.4 },
        { territory: 'strongholds', color: '#e9bb42', opacity: 0.4 },
        { territory: 'polar', color: '#d63a2a' },
      ])
    ).toEqual([
      {
        id: 'highlights-1',
        name: 'Highlights 1',
        color: '#e9bb4266',
        territories: ['funeral_plain'],
        types: ['stronghold'],
      },
      { id: 'highlights-2', name: 'Highlights 2', color: '#d63a2a59', territories: ['polar_sink'] },
    ]);
  });

  it('names a single colour plainly and has nothing for no highlights', () => {
    expect(boardHighlightTints([{ territory: 'arrakeen', color: '#2f7fe0', opacity: 1 }])).toEqual([
      { id: 'highlights-1', name: 'Highlights', color: '#2f7fe0ff', territories: ['arrakeen'] },
    ]);
    expect(boardHighlightTints([])).toEqual([]);
  });

  it('leaves out the sector guides, which are artwork rather than a territory', () => {
    expect(boardHighlightTints([{ territory: 'sectors', color: '#2f7fe0' }])).toEqual([]);
  });
});
