import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();
crons.interval('Retry pending Play account deletions', { minutes: 1 }, internal.playDeletion.retryDueDeletions, {});
export default crons;
