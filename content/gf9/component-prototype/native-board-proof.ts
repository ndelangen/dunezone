/** Read-only resolution of package bindings for the native linked-board proof. */
import { CustomCardTokens } from '../../../src/shared/assets/schema';
import { TREACHERY_BACKGROUNDS } from '../../../src/shared/assets/treacheryStyles';
import { HistoricalBoardDefinition } from '../../../src/shared/boards/schema';
import packageData from '../package.json';

export const linkedBoard = HistoricalBoardDefinition.parse(
  packageData.items.find((item) => item.key === 'gf9-board')!.data.board
);

const marker = (name: string, image: string, colors: [string, string]) => {
  const checked = CustomCardTokens.parse({
    marker: {
      type: 'token-disc',
      name,
      face: {
        image: '/vector/icon/spice.svg',
        background: { ...TREACHERY_BACKGROUNDS.stripedSpecial, colors },
        symbolScale: 1.15,
        top: '',
        bottomFirst: '',
        bottomSecond: '',
        ring: true,
      },
    },
  }).marker!;
  if (checked.type === 'token-enhance') throw new Error('Expected a round marker.');
  return { ...checked, face: { ...checked.face, image: image as typeof checked.face.image } };
};

/** Generic type markers, whose fronts depict the face-down type rather than any revealed Discovery result. */
export const linkedBoardTokens = {
  'gf9-spice-location-marker': marker('Spice location', '/vector/icon/spice.svg', ['#bb8a32', '#e5c878']),
  'gf9-hiereg-discovery-marker': marker('Hiereg Discovery token', '/vector/logo/fremen.svg', ['#315c51', '#92b6a0']),
  'gf9-smuggler-discovery-marker': marker('Smuggler Discovery token', '/vector/logo/guild.svg', ['#253861', '#819fca']),
};
