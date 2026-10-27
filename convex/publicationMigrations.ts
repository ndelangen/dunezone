import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';

import { components, internal } from './_generated/api';
import { internalMutation } from './functions';
import { assertPublicationJobListing, syncPublicationJobListing } from './lib/publicationJobListings';
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
  batchSize: 8,
  migrateOne: async (ctx, row) => {
    await syncPublicationJobListing(ctx, row._id, row);
  },
});

/** Enables indexed reads only after every remaining job has its exact metadata and both order entries. */
export const publication_job_listings_verify_v1 = migrations.define({
  table: 'publication_jobs',
  batchSize: 8,
  migrateOne: async (ctx, row) => {
    await assertPublicationJobListing(ctx, row);
  },
});

export const PUBLICATION_MIGRATION_IDS: Record<string, FunctionReference<'mutation', 'internal'>> = {
  publication_job_listings_v1: internal.publicationMigrations.publication_job_listings_v1,
  publication_job_listings_verify_v1: internal.publicationMigrations.publication_job_listings_verify_v1,
};
