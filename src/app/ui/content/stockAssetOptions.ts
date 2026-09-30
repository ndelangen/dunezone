import { stockAssetCollections } from '@shared/stockAssetCollections';

const collectionsByAsset = new Map<string, (typeof stockAssetCollections)[number]>(
  stockAssetCollections.flatMap((collection) => collection.assets.map((asset) => [asset, collection] as const))
);

function words(value: string) {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fallbackCollection(value: string) {
  const [, kind, category, source] = value.split('/');
  if (kind === 'image' && category === 'leader') {
    return `Portraits / ${words(source ?? 'Other')}`;
  }
  if (kind === 'vector') {
    const categoryLabel =
      (
        {
          logo: 'Emblems',
          generic: 'General symbols',
          decal: 'Decals',
          icon: 'Game icons',
          troop: 'Troops',
          troop_modifier: 'Troop modifiers',
          background: 'Patterns',
        } as Record<string, string>
      )[category ?? ''] ?? 'Symbols';
    if (category === 'decal' || category === 'generic') {
      const name = value.split('/').at(-1) ?? '';
      const theme = /poison|chaumurky|chaumas|residual|snooper|antidote|semuta/.test(name)
        ? 'Poison and protection'
        : /sword|blade|gun|weapon|laser|lazgun|shield|artillery|atomics|stone-burner|battle/.test(name)
          ? 'Weapons and combat'
          : /thopter|harvest|carryall|ship|transport|smuggl|caravan/.test(name)
            ? 'Vehicles and transport'
            : /water|spice|worm|shai|sand|desert|storm|weather|thumper|plant|tree/.test(name)
              ? 'Desert and resources'
              : /hand|eye|head|face|heart|skull|body/.test(name)
                ? 'People and anatomy'
                : 'Other symbols';
      return `${categoryLabel} / ${theme}`;
    }
    return categoryLabel;
  }
  return words(category ?? 'Artwork');
}

/** Labels and browsing collections for stock artwork, without changing its saved identifier. */
export function stockAssetOptions(values: readonly string[]) {
  return values
    .map((value) => {
      const collection = collectionsByAsset.get(value);
      const name = (value.split('/').at(-1) ?? value).replace(/\.[^.]+$/, '');
      const group = collection?.label ?? fallbackCollection(value);
      return {
        value,
        glyphPreview: value.startsWith('/vector/') && !value.includes('-multicolor'),
        label: words(name),
        collection: group,
        keywords: `${group} ${collection?.keywords ?? ''} ${value}`,
      };
    })
    .sort((a, b) => {
      const order = (value: string) => {
        const collection = collectionsByAsset.get(value);
        return collection ? stockAssetCollections.indexOf(collection) : stockAssetCollections.length;
      };
      return (
        order(a.value) - order(b.value) || a.collection.localeCompare(b.collection) || a.label.localeCompare(b.label)
      );
    });
}
