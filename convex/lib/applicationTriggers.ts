import { Triggers } from 'convex-helpers/server/triggers';

import type { DataModel } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { registerProfileActivityTriggers } from './profileActivity';
import { registerProfileDiscoveryTriggers } from './profileDiscovery';
import { registerStatisticsTriggers } from './statistics';

export const applicationTriggers = new Triggers<DataModel, MutationCtx>();

registerStatisticsTriggers(applicationTriggers);
registerProfileActivityTriggers(applicationTriggers);
registerProfileDiscoveryTriggers(applicationTriggers);
