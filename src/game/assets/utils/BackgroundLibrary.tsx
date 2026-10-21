import { cardFrontStyleFor } from '@shared/assets/cardFrontPresets';
import type { CardFrontPreset, CardFrontStyle } from '@shared/assets/cardFrontPresets';
import type { BackgroundData, SharedBackgroundPreset } from '@shared/backgrounds/schema';
import { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';

const FrontPresetContext = createContext<readonly CardFrontPreset[]>([]);
const BackgroundLibraryContext = createContext<readonly SharedBackgroundPreset[]>([]);
export function BackgroundLibrary({
  presets,
  children,
  fronts = [],
}: PropsWithChildren<{ presets: readonly SharedBackgroundPreset[]; fronts?: readonly CardFrontPreset[] }>) {
  return (
    <BackgroundLibraryContext.Provider value={presets}>
      <FrontPresetContext.Provider value={fronts}>{children}</FrontPresetContext.Provider>
    </BackgroundLibraryContext.Provider>
  );
}
export function useResolvedBackground(value: BackgroundData): BackgroundData {
  const presets = useContext(BackgroundLibraryContext);
  const source = value.source;
  return source?.kind === 'preset' ? (presets.find((preset) => preset.key === source.key)?.value ?? value) : value;
}

export function useResolvedCardFront(
  type: string,
  data: unknown,
  supplied?: CardFrontStyle
): CardFrontStyle | undefined {
  const fronts = useContext(FrontPresetContext);
  return supplied ?? cardFrontStyleFor(type, data, fronts);
}

export function useBackgroundLibrary() {
  return useContext(BackgroundLibraryContext);
}
