import { GENERIC, LEADERS } from '@shared/assetIds';
import { isRetiredStockAsset } from '@shared/retiredStockAssets';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { describe, expect, it } from 'vite-plus/test';

import { catalogueEntries } from '@app/routes/_app/media/mediaCatalogue';

const retiredLeaders = LEADERS.options.filter(isRetiredStockAsset);

describe('retired stock artwork', () => {
  it('covers the Nod and Red Alert portraits and the Nod symbol', () => {
    expect(retiredLeaders).toContain('/image/leader/nod/kane.png');
    expect(retiredLeaders).toContain('/image/leader/red-alert-2/tanya.png');
    expect(retiredLeaders.every((path) => /^\/image\/leader\/(nod|red-alert-[123])\//.test(path))).toBe(true);
    expect(retiredLeaders.length).toBe(61);
    expect(GENERIC.options.filter(isRetiredStockAsset)).toEqual(['/vector/generic/nod.svg']);
  });

  it('stays a valid stock id, so saved data that uses one still parses', () => {
    expect(LEADERS.safeParse('/image/leader/nod/kane.png').success).toBe(true);
    expect(GENERIC.safeParse('/vector/generic/nod.svg').success).toBe(true);
  });

  it('is never offered in a picker or the media catalogue', () => {
    expect(stockAssetOptions([...LEADERS.options, ...GENERIC.options]).some((o) => isRetiredStockAsset(o.value))).toBe(
      false
    );
    expect(catalogueEntries.some((entry) => isRetiredStockAsset(entry.value))).toBe(false);
    const offered = new Set(stockAssetOptions(LEADERS.options).map((option) => option.value));
    expect(offered.has('/image/leader/nod/kane.png')).toBe(false);
    expect(offered.has('/image/leader/official/duncan.png')).toBe(true);
  });
});
