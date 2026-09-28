import { loadProfileSchema } from '../../src/shared/play/loadProfile.ts';

/**
 * The profiles the load runner accepts.
 * `baseline` creates its game without a load profile, so it stays out of `loadProfileSchema`, which Convex, the game Worker and hosted cells validate against.
 */
export const runnerProfiles = ['baseline', ...loadProfileSchema.options] as const;
