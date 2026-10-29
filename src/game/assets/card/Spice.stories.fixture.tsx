import { spiceBoardLink } from '@shared/assets/fixtures/spiceBoardCard';
import type { ComponentProps } from 'react';

import type { SpiceCard } from './Spice';

export type SpiceCardProps = ComponentProps<typeof SpiceCard>;

export const discoveryOnBoard: SpiceCardProps = {
  name: 'Funeral Plain',
  subName: 'Spice blow - Discovery',
  icon: 'spice',
  highlights: [],
  amount: 6,
  text: `**Smuggler token** on Pasty Mesa\n+\n**6 spice** on Funeral Plain`,
  board: spiceBoardLink,
};
