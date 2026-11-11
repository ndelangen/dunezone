import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();
crons.interval('Retry pending Play account deletions', { minutes: 15 }, internal.playDeletion.retryDueDeletions, {});
crons.interval('Retry pending Play session cutoffs', { minutes: 15 }, internal.playSessionCutoffs.retryDueCutoffs, {});
crons.interval('Reconcile Discord voice rooms', { minutes: 15 }, internal.playDiscord.retryDue, {});
crons.interval('Check ended Discord voice rooms', { hours: 1 }, internal.playDiscordVoice.checkDue, {});
export default crons;
