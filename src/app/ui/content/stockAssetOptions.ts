import stockAssetCollections from '@shared/stockAssetCollections.json';

const collectionsByAsset = new Map<string, (typeof stockAssetCollections)[number]>(
  stockAssetCollections.flatMap((collection) => collection.assets.map((asset) => [asset, collection] as const))
);

function words(value: string) {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const vectorCategories: Record<string, string> = {
  logo: 'Emblems',
  generic: 'General symbols',
  decal: 'Decals',
  icon: 'Game icons',
  troop: 'Troops',
  troop_modifier: 'Troop modifiers',
  background: 'Patterns',
};

const vectorThemes = [
  { match: /poison|chaumurky|chaumas|residual|snooper|antidote|semuta/, label: 'Poison and protection' },
  {
    match: /sword|blade|gun|weapon|laser|lazgun|shield|artillery|atomics|stone-burner|battle/,
    label: 'Weapons and combat',
  },
  { match: /thopter|harvest|carryall|ship|transport|smuggl|caravan/, label: 'Vehicles and transport' },
  { match: /water|spice|worm|shai|sand|desert|storm|weather|thumper|plant|tree/, label: 'Desert and resources' },
  { match: /hand|eye|head|face|heart|skull|body/, label: 'People and anatomy' },
];

function fallbackCollection(value: string) {
  const [, kind, category = 'Artwork', source = 'Other'] = value.split('/');
  if (kind === 'image' && category === 'leader') {
    return `Portraits / ${words(source)}`;
  }
  if (kind !== 'vector') {
    return words(category);
  }
  const categoryLabel = vectorCategories[category] ?? 'Symbols';
  if (category !== 'decal' && category !== 'generic') {
    return categoryLabel;
  }
  const name = value.split('/').at(-1) ?? '';
  const theme = vectorThemes.find(({ match }) => match.test(name))?.label ?? 'Other symbols';
  return `${categoryLabel} / ${theme}`;
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
