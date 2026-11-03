import { INITIAL_BACKGROUND_PRESETS } from '@shared/backgrounds/defaults';

import { db, storybookViewer } from '@db/storybook/database';
import type { WorkerIdentity } from '@db/storybook/protocol';

/*
 * What a creator tutorial's practice copy of the site starts with: the page stories' catalogue, signed in as the tutorial's learner.
 * The learner is an ordinary member there, not an administrator, so the pages show them what a new creator sees.
 * The site's stock background presets are there as the preset library writes them on the site, so the background picker has its choices.
 */
export const practiceDatabase = db((baseline) => {
  baseline.users = baseline.users.map((user) => ({ ...user, isAdmin: false }));
  baseline.background_presets = INITIAL_BACKGROUND_PRESETS.map((preset) => ({ ...preset, updated_at: 0 }));
});

export const PRACTICE_VIEWER: WorkerIdentity = storybookViewer;
