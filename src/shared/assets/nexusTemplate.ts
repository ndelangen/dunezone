import type { z } from 'zod';

import type { Background } from '../factions/schema';

/* The printed Nexus head and its default emblem are shared by the editor and imported deck. */
export const NEXUS_HEAD: z.infer<typeof Background> = {
  image: '/image/texture/082.jpg',
  colors: ['#073A16', '#246B32'],
  influence: 0.65,
  invert: false,
  definition: 1,
};
