import { useQuery } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';

import { api } from '../../../convex/_generated/api';
import type { AssetListEntry } from './assets';
import { useLiveMutation } from './core/live';

export function useCardPresetsPage() {
  return useQuery(api.cardFrontPresets.page, {});
}
export function useCardFrontPresets() {
  return useQuery(api.cardFrontPresets.list, {});
}
export function useSaveCardFrontPreset() {
  return useLiveMutation<
    FunctionArgs<typeof api.cardFrontPresets.save>,
    FunctionReturnType<typeof api.cardFrontPresets.save>
  >(api.cardFrontPresets.save);
}

export function useStormCardAuthoring(ids: string[]) {
  return useQuery(api.cardFrontPresets.stormAuthoring, { ids: ids as AssetListEntry['id'][] });
}
