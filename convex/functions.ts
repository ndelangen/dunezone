/* oxlint-disable no-restricted-imports -- This is the sole raw mutation-builder boundary. */
import { customCtx, customMutation } from 'convex-helpers/server/customFunctions';

import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from './_generated/server';
import { statisticsTriggers } from './lib/statistics';

export const mutation = customMutation(rawMutation, customCtx(statisticsTriggers.wrapDB));
export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(statisticsTriggers.wrapDB)
);
