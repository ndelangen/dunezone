/* oxlint-disable no-restricted-imports -- This is the sole raw mutation-builder boundary. */
import { customCtx, customMutation } from 'convex-helpers/server/customFunctions';

import { internalMutation as rawInternalMutation, mutation as rawMutation } from './_generated/server';
import { applicationTriggers } from './lib/applicationTriggers';

export const mutation = customMutation(rawMutation, customCtx(applicationTriggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(applicationTriggers.wrapDB));
