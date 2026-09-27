import { loadProfileSchema } from '../../src/shared/play/loadProfile.ts';

/**
 * The profiles the load runner accepts.
 * `baseline` runs the production room with the original seats, so it stays out of `loadProfileSchema`, which Convex validates stored games against.
 */
export const runnerProfiles = ['baseline', ...loadProfileSchema.options] as const;
