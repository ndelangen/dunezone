import {
  BACKGROUND,
  DECAL,
  GENERIC,
  ICON,
  LEADERS,
  LOGO,
  PLANET,
  TEXTURE,
  TROOP,
  TROOP_MODIFIER,
} from '@shared/assetIds';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';

import metadata from './media-index.json';
import { indexedMediaKinds, mediaKinds } from './mediaSearchParams';
import type { MediaKind } from './mediaSearchParams';

export interface MediaEntry {
  value: string;
  label: string;
  collection: string;
  description: string;
  tags: readonly string[];
  subjects: readonly string[];
  glyphPreview: boolean;
  kind: MediaKind;
}

const indexedPaths = (prefix: string) => Object.keys(metadata).filter((path) => path.startsWith(prefix));

const assetsByKind: Record<MediaKind, readonly string[]> = {
  decal: DECAL.options,
  generic: GENERIC.options,
  logo: LOGO.options,
  icon: ICON.options,
  troop: TROOP.options,
  troop_modifier: TROOP_MODIFIER.options,
  background: [...BACKGROUND.options, ...indexedPaths('/image/background/')],
  cover: indexedPaths('/image/rulebook-cover/'),
  card: indexedPaths('/image/card/'),
  shield: indexedPaths('/image/shield/'),
  web: indexedPaths('/web/'),
  leader: LEADERS.options,
  planet: PLANET.options,
  texture: TEXTURE.options,
};

export const mediaEntries: MediaEntry[] = indexedMediaKinds.flatMap(({ value: kind }) =>
  stockAssetOptions(assetsByKind[kind]).map(({ keywords: _collectionKeywords, ...entry }) => ({
    ...entry,
    kind,
    ...(['cover', 'card', 'shield', 'web'].includes(kind)
      ? { collection: indexedMediaKinds.find((item) => item.value === kind)!.label }
      : {}),
    ...metadata[entry.value as keyof typeof metadata],
  }))
);

export const catalogueEntries = mediaEntries.filter((entry) => mediaKinds.some((kind) => kind.value === entry.kind));
