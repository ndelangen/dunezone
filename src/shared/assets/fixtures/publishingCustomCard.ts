import type { z } from 'zod';

import type { CustomCardAsset } from '../schema';
import { publishingTreacheryCard } from './publishingTreacheryCard';

/** A custom composition with interleaved text and decals for save and capture checks. */
export const publishingCustomCard: z.infer<typeof CustomCardAsset> = {
  name: 'Battle reference',
  subName: 'Reference',
  about: 'A reference card for resolving a battle.',
  format: 'plain',
  head: publishingTreacheryCard.head,
  icon: publishingTreacheryCard.icon,
  layers: [
    {
      kind: 'text',
      layerId: '20000000-2000-4000-8000-200000000001',
      content: '*Battle plan*\nChoose your leader, weapon and defense.\n\nCommit your plan before revealing it.',
      offset: [-361, -331.5],
      width: 734,
      height: 650,
      size: 40,
      font: 'C_Candara',
      color: '#0b0503',
      align: 'left',
      opacity: 1,
      rotation: 0,
    },
    {
      kind: 'decal',
      layerId: '20000000-2000-4000-8000-200000000002',
      id: '/vector/logo/atreides.svg',
      offset: [0, 280],
      scale: 0.5,
      muted: false,
      outline: true,
      opacity: 0.7,
      rotation: 15,
    },
    {
      kind: 'text',
      layerId: '20000000-2000-4000-8000-200000000003',
      content: 'Keep this card beside your faction sheet.',
      offset: [-361, 420],
      width: 734,
      height: 130,
      size: 30,
      font: 'C_Trebuchet',
      color: '#0b0503',
      align: 'center',
      opacity: 1,
      rotation: 0,
    },
  ],
};
