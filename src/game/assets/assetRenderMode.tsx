import { createContext, useContext } from 'react';
import type { FC, ReactNode } from 'react';

import type { AssetSize } from '../../shared/assetRules';
import { resolveAsset } from './resolveAsset';

/**
 * Ambient render mode (#254): `display` everywhere by default; the print preview route and the publisher capture wrap
 * their trees in `print` so the same components resolve print-grade variants without prop threading.
 */
export type AssetRenderMode = 'display' | 'print';

const AssetRenderModeContext = createContext<AssetRenderMode>('display');

export const AssetRenderModeProvider: FC<{ mode: AssetRenderMode; children: ReactNode }> = ({ mode, children }) => (
  <AssetRenderModeContext.Provider value={mode}>{children}</AssetRenderModeContext.Provider>
);

/**
 * Resolve an asset key in the ambient render mode. An explicit `size` wins over the mode (thumbnails are `small` in
 * every world).
 */
export function useAsset(key: string, size?: AssetSize): string {
  const mode = useContext(AssetRenderModeContext);
  return resolveAsset(key, size ?? (mode === 'print' ? 'print' : 'large'));
}

/** For resolving inside loops, where calling the hook per item is not possible. */
export function useAssetResolver(): (key: string, size?: AssetSize) => string {
  const mode = useContext(AssetRenderModeContext);
  return (key, size) => resolveAsset(key, size ?? (mode === 'print' ? 'print' : 'large'));
}
