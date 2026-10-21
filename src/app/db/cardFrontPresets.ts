import { useAuthoringPresets } from './backgroundPresets';

export function useCardFrontPresets() {
  return useAuthoringPresets()?.fronts;
}
