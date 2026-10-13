import type { FunctionArgs, FunctionReturnType } from 'convex/server';

import { api } from '../../../convex/_generated/api';
import { useLiveMutation, useLiveQuery } from './core/live';
export function useCardbackPresets() {
  return useLiveQuery(api.cardbackPresets.list, {});
}
export function useSaveCardbackPreset() {
  return useLiveMutation<
    FunctionArgs<typeof api.cardbackPresets.save>,
    FunctionReturnType<typeof api.cardbackPresets.save>
  >(api.cardbackPresets.save);
}
