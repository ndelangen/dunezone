import preview from '@sb/preview';
import { publishingCustomCard } from '@shared/assets/fixtures/publishingCustomCard';

import { CustomCard } from './Custom';

const { about: _about, ...face } = publishingCustomCard;
const meta = preview.meta({
  component: CustomCard,
  globals: { viewport: { value: 'card' } },
  args: face,
});

export const Plain = meta.story({});
export const WithDecalWindow = meta.story({ args: { format: 'decal-window' } });
export const LongTitle = meta.story({ args: { name: 'A very long custom card title that must fit inside the Head' } });
export const WithoutIcon = meta.story({ args: { icon: undefined } });
