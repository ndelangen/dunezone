import { useQuery } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { useState } from 'react';

import { api } from '../../../convex/_generated/api';
import { useLiveMutation } from './core/live';

export function useBackgroundPresets() {
  return useQuery(api.backgroundPresets.list, {});
}
export function usePresetLibrary() {
  return useQuery(api.presetLibrary.page, {});
}
export function useInitializePresetLibrary() {
  return useLiveMutation<
    FunctionArgs<typeof api.presetLibrary.initialize>,
    FunctionReturnType<typeof api.presetLibrary.initialize>
  >(api.presetLibrary.initialize);
}
export function useSaveFamilyPreset() {
  return useLiveMutation<
    FunctionArgs<typeof api.presetLibrary.saveFamily>,
    FunctionReturnType<typeof api.presetLibrary.saveFamily>
  >(api.presetLibrary.saveFamily);
}
export function useSaveDiscoveryPreset() {
  return useLiveMutation<
    FunctionArgs<typeof api.presetLibrary.saveDiscovery>,
    FunctionReturnType<typeof api.presetLibrary.saveDiscovery>
  >(api.presetLibrary.saveDiscovery);
}

export function useAuthoringPresets(ids?: string[]) {
  const result = useQuery(
    api.presetLibrary.authoring,
    ids?.length ? { ids: ids as FunctionArgs<typeof api.presetLibrary.authoring>['ids'] } : {}
  );
  /* Standards stay visible while a changed token selection loads its faces. */
  const [loaded, setLoaded] = useState<typeof result>();
  if (result !== undefined && result !== loaded) {
    setLoaded(result);
  }
  const pending = loaded ? { ...loaded, tokens: {}, error: null } : undefined;
  return result ?? pending;
}
