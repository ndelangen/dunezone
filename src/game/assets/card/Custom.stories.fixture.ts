import { publishingCustomCard } from '@shared/assets/fixtures/publishingCustomCard';
import { standardStormCard } from '@shared/assets/standardStormDeck';

const { about: _about, ...withoutAbout } = publishingCustomCard;
export const face = withoutAbout;
export const windowCard = standardStormCard(1);
export const windowLayers = windowCard.layers;
