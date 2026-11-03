import { GENERIC, LEADERS } from '@shared/assetIds';
import { isRetiredStockAsset } from '@shared/retiredStockAssets';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { describe, expect, it } from 'vite-plus/test';

import { catalogueEntries } from '@app/routes/_app/media/mediaCatalogue';

const retiredLeaders = LEADERS.options.filter(isRetiredStockAsset);

describe('retired stock artwork', () => {
  it('covers the Nod and Red Alert portraits and the Nod symbol', () => {
    expect(retiredLeaders.length).toBe(61);
    expect(GENERIC.options.filter(isRetiredStockAsset)).toEqual(['/vector/generic/nod.svg']);
  });

  it('stays a valid leader image, so saved factions that use one still load', () => {
    expect(LEADERS.safeParse('/image/leader/nod/kane.png').success).toBe(true);
    expect(GENERIC.safeParse('/vector/generic/nod.svg').success).toBe(true);
  });

  it('is never offered in a picker or the media catalogue', () => {
    expect(stockAssetOptions([...LEADERS.options, ...GENERIC.options]).some((o) => isRetiredStockAsset(o.value))).toBe(
      false
    );
    expect(catalogueEntries.some((entry) => isRetiredStockAsset(entry.value))).toBe(false);
  });
});
