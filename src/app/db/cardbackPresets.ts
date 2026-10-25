import { useAuthoringPresets } from './backgroundPresets';

export function useCardbackPresets() {
  return useAuthoringPresets()?.backs;
}
