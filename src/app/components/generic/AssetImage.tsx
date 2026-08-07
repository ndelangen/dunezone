import type { CSSProperties, ImgHTMLAttributes } from 'react';

import { useAsset } from '../../../game/assets/assetRenderMode';
import { ASSET_MAP } from '../../../game/data/assetMap.generated';
import type { AssetSize } from '../../../shared/assetRules';

type AssetImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /** Opaque asset key, e.g. `/image/texture/021.jpg`. */
  image: string;
  /** Explicit tier; defaults to the ambient render mode's choice. */
  size?: AssetSize;
};

/**
 * The one `<img>` for DB-driven imagery (#255): resolves the key via the ambient render mode,
 * paints the asset's dominant color under the image so slots never flash white, and defaults to
 * lazy/async loading. Size the slot (width/height or CSS) to keep layout stable.
 */
export function AssetImage({
  image,
  size,
  style,
  loading,
  decoding,
  alt = '',
  ...rest
}: AssetImageProps) {
  const src = useAsset(image, size);
  const color = (ASSET_MAP as Record<string, { color?: string }>)[image]?.color;
  const backgroundStyle: CSSProperties | undefined = color
    ? { backgroundColor: color, ...style }
    : style;
  return (
    <img
      {...rest}
      alt={alt}
      decoding={decoding ?? 'async'}
      loading={loading ?? 'lazy'}
      src={src}
      style={backgroundStyle}
    />
  );
}
