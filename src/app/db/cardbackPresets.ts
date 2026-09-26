import { useQuery } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';

import { api } from '../../../convex/_generated/api';
import { useLiveMutation } from './core/live';
export function useCardbackPresets() {
  return useQuery(api.cardbackPresets.list, {});
}
export function useSaveCardbackPreset() {
  return useLiveMutation<
    FunctionArgs<typeof api.cardbackPresets.save>,
    FunctionReturnType<typeof api.cardbackPresets.save>
  >(api.cardbackPresets.save);
}
