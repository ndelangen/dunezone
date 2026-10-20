/** Read-only resolution of package bindings for the native linked-board proof. */
import { CustomCardTokens } from '../../../src/shared/assets/schema';
import { TREACHERY_BACKGROUNDS } from '../../../src/shared/assets/treacheryStyles';
import { HistoricalBoardDefinition } from '../../../src/shared/boards/schema';
import { Background } from '../../../src/shared/factions/schema';
import packageData from '../package.json';
import tokenBackBackgrounds from './token-back-backgrounds.json';

export const linkedBoard = HistoricalBoardDefinition.parse(
  packageData.items.find((item) => item.key === 'gf9-board')!.data.board
);

const marker = (
  name: string,
  image: string,
  colors: [string, string],
  background?: typeof tokenBackBackgrounds.hiereg | typeof tokenBackBackgrounds.smuggler,
  symbolScale = 1.15,
  ring = true
) => {
  const checked = CustomCardTokens.parse({
    marker: {
      type: 'token-disc',
      name,
      face: {
        image: '/vector/icon/spice.svg',
        background: Background.parse(
          background
            ? { ...background, image: '/image/texture/082.jpg' }
            : { ...TREACHERY_BACKGROUNDS.stripedSpecial, colors }
        ),
        symbolScale,
        top: '',
        bottomFirst: '',
        bottomSecond: '',
        ring,
      },
    },
  }).marker!;
  if (checked.type === 'token-enhance') throw new Error('Expected a round marker.');
  // Draft artwork keys are not in the generated catalogue until normal media ingestion.
  // Validate the current Background shape, then carry only the explicit staged image key into this proof.
  return {
    ...checked,
    face: {
      ...checked.face,
      image: image as typeof checked.face.image,
      background: {
        ...checked.face.background,
        image: (background?.image ?? checked.face.background.image) as typeof checked.face.background.image,
      },
    },
  };
};

/** Generic type markers, whose fronts depict the face-down type rather than any revealed Discovery result. */
export const linkedBoardTokens = {
  'gf9-spice-location-marker': marker('Spice location', '/vector/icon/spice.svg', ['#bb8a32', '#e5c878']),
  'gf9-hiereg-discovery-marker': marker(
    'Hiereg Discovery token',
    '/vector/logo/fremen.svg',
    ['#315c51', '#92b6a0'],
    tokenBackBackgrounds.hiereg,
    2,
    false
  ),
  'gf9-smuggler-discovery-marker': marker(
    'Smuggler Discovery token',
    '/vector/logo/guild.svg',
    ['#253861', '#819fca'],
    tokenBackBackgrounds.smuggler,
    2,
    false
  ),
};
