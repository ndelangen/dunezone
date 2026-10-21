import { useQuery } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';

import { api } from '../../../convex/_generated/api';
import { useLiveMutation } from './core/live';

export function useBackgroundPresets(enabled = true) {
  return useQuery(api.backgroundPresets.list, enabled ? {} : 'skip');
}
export function usePresetLibrary() {
  return useQuery(api.presetLibrary.page, {});
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

export function useAuthoringPresets(enabled = true, ids?: string[]) {
  return useQuery(
    api.presetLibrary.authoring,
    enabled ? (ids?.length ? { ids: ids as FunctionArgs<typeof api.presetLibrary.authoring>['ids'] } : {}) : 'skip'
  );
}
