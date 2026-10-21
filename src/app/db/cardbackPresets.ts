import type { FunctionArgs, FunctionReturnType } from 'convex/server';

import { api } from '../../../convex/_generated/api';
import { useAuthoringPresets } from './backgroundPresets';
import { useLiveMutation } from './core/live';
export function useCardbackPresets() {
  return useAuthoringPresets()?.backs;
}
export function useSaveCardbackPreset() {
  return useLiveMutation<
    FunctionArgs<typeof api.cardbackPresets.save>,
    FunctionReturnType<typeof api.cardbackPresets.save>
  >(api.cardbackPresets.save);
}
