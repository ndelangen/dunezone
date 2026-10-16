import { LEADERS } from '@shared/assetIds';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { describe, expect, it } from 'vite-plus/test';

import { matchAsset, searchTerms } from './assetSearch';

const leaders = stockAssetOptions(LEADERS.options);
const find = (query: string) =>
  leaders
    .map((option) => ({ option, match: matchAsset(searchTerms(query), option) }))
    .filter(({ match }) => match > 0)
    .sort((a, b) => b.match - a.match)
    .map(({ option }) => option.label);

describe('matchAsset', () => {
  it('shows corrected names for misspelled portrait files', () => {
    expect(find('nefud')[0]).toBe('Nefud');
    expect(find('dr yueh')[0]).toBe('Dr. Yueh');
    expect(find('rhombur')[0]).toBe('Rhombur');
    expect(find('ctair')[0]).toBe("C'Tair");
  });

  it('finds near misses of a name', () => {
    expect(find('nafud')).toContain('Nefud');
    expect(find('dryeuh')).toContain('Dr. Yueh');
    expect(find('yeuh')).toContain('Dr. Yueh');
    expect(find('stilger')).toContain('Stilgar');
    expect(find('gurny')).toContain('Gurney');
  });

  it('ranks names containing the typed words above near misses', () => {
    const asset = { label: 'Nefud' };
    expect(matchAsset(['nefud'], asset)).toBe(2);
    expect(matchAsset(['nafud'], asset)).toBe(1);
    expect(matchAsset(['nef'], asset)).toBe(2);
  });

  it('matches everything without a search', () => {
    expect(matchAsset([], { label: 'Nefud' })).toBe(2);
  });

  it('keeps short and unrelated words strict', () => {
    expect(matchAsset(['nfd'], { label: 'Nefud' })).toBe(0);
    expect(matchAsset(['paul'], { label: 'Nefud' })).toBe(0);
    expect(matchAsset(['harkonen'], { label: 'Nefud', keywords: 'House Harkonnen' })).toBe(0);
  });
});
