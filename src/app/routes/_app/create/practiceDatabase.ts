import { db, storybookViewer } from '@db/storybook/database';
import type { WorkerIdentity } from '@db/storybook/protocol';

/*
 * What a creator tutorial's practice copy of the site starts with: the page stories' catalogue, signed in as the tutorial's learner.
 * The learner is an ordinary member there, not an administrator, so the pages show them what a new creator sees.
 */
export const practiceDatabase = db((baseline) => {
  baseline.users = baseline.users.map((user) => ({ ...user, isAdmin: false }));
});

export const PRACTICE_VIEWER: WorkerIdentity = storybookViewer;
