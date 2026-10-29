import { resolveAsset } from '@shared/media/resolveAsset';

import type { FaqWalkthroughProps } from './FaqWalkthrough';

export const exchange: FaqWalkthroughProps = {
  asker: 'Chani',
  askerImage: resolveAsset('/image/leader/official/chani.png', 'small'),
  question: 'Can I ship troops into the storm?',
  answers: [
    {
      author: 'Stilgar',
      image: resolveAsset('/image/leader/official/stilgar.png', 'small'),
      text: 'No. Shipment into a territory under the storm is never allowed.',
    },
    {
      author: 'Liet',
      image: resolveAsset('/image/leader/official/liet.jpg', 'small'),
      text: 'The storm blocks shipment and movement into it, and troops already there are lost when it moves over them.',
    },
    {
      author: 'Jessica',
      image: resolveAsset('/image/leader/official/jessica.png', 'small'),
      text: 'Unless your faction has an advantage that says otherwise. Check your sheet.',
    },
  ],
  accepted: 1,
};
