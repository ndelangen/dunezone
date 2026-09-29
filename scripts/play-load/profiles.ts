import { loadProfileSchema } from '../../src/shared/play/loadProfile.ts';

/**
 * The profiles the load runner accepts.
 * `baseline` runs the production game Worker, so it stays out of `loadProfileSchema`, which the Worker's load entry and hosted cells validate against.
 */
export const runnerProfiles = ['baseline', ...loadProfileSchema.options] as const;
