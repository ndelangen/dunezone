import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();
crons.interval('Retry pending Play account deletions', { minutes: 15 }, internal.playDeletion.retryDueDeletions, {});
crons.interval('Retry pending Play session cutoffs', { minutes: 15 }, internal.playSessionCutoffs.retryDueCutoffs, {});
export default crons;
