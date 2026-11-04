import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';

import { components, internal } from './_generated/api';
import { internalMutation } from './functions';
import {
  assertPublicationJobListing,
  dropRetiredOrderItems,
  syncPublicationJobListing,
} from './lib/publicationJobListings';
import schema from './schema';

const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'publicationMigrations:',
  schema,
});

/** Copies only admin-visible metadata, leaving job payloads and processing state untouched. */
export const publication_job_listings_v1 = migrations.define({
  table: 'publication_jobs',
  /* A captured render payload can approach the document limit. */
  batchSize: 4,
  migrateOne: async (ctx, row) => {
    await syncPublicationJobListing(ctx, row._id, row);
  },
});

/** Enables indexed reads only after every remaining job has its exact metadata and its order entry. */
export const publication_job_listings_verify_v1 = migrations.define({
  table: 'publication_jobs',
  batchSize: 4,
  migrateOne: async (ctx, row) => {
    await assertPublicationJobListing(ctx, row);
  },
});

/** Removes the per-asset-type order entries the queue stopped writing in November 2026; a replay finds nothing to remove. */
export const publication_queue_type_orders_drop_v1 = migrations.define({
  table: 'publication_job_listings',
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    await dropRetiredOrderItems(ctx, row);
  },
});

export const PUBLICATION_MIGRATION_IDS: Record<string, FunctionReference<'mutation', 'internal'>> = {
  publication_job_listings_v1: internal.publicationMigrations.publication_job_listings_v1,
  publication_job_listings_verify_v1: internal.publicationMigrations.publication_job_listings_verify_v1,
  publication_queue_type_orders_drop_v1: internal.publicationMigrations.publication_queue_type_orders_drop_v1,
};
