/// <reference types="vite/client" />
import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';

import type { components } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

/* Every aggregate instance `convex/convex.config.ts` mounts; a trigger may write to any of them from any mutation. */
const AGGREGATE_COMPONENTS = [
  'statistics',
  'profileDiscovery',
  'profileActivity',
  'catalogueOrder',
] as const satisfies readonly (keyof typeof components)[];

type ApplicationTestOptions = Omit<Parameters<typeof convexTest>[0], 'schema'>;

/**
 * A `convexTest` with the app's schema, modules and every installed component registered, so a test that writes through the triggers never fails on a component it did not know it touched.
 * Mounting a component in `convex.config.ts` means adding it here, once.
 */
export function applicationTest(options: ApplicationTestOptions = {}) {
  const t = convexTest({ schema, modules, ...options });
  for (const name of AGGREGATE_COMPONENTS) {
    aggregateTest.register(t, name);
  }
  migrationsTest.register(t);
  rateLimiterTest.register(t);
  return t;
}
