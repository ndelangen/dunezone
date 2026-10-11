import { z } from 'zod';

/** How big a token is in play, as a share of the standard size; absent means standard. */
export const PHYSICAL_SIZE_MIN = 0.2;
export const PHYSICAL_SIZE_MAX = 2;
export const PhysicalSize = z.number().min(PHYSICAL_SIZE_MIN).max(PHYSICAL_SIZE_MAX);
