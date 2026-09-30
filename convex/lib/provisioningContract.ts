import type { TableNames } from '../_generated/dataModel';

/**
 * Where a rebuilt deployment's data came from.
 * `snapshot` is the anonymised, published-only snapshot that cloud dev and `app:dev --local --data=snapshot` load (#1559).
 * `production` is a raw production export, which only `app:dev --local --clone-prod` loads, for local break-glass use.
 */
export type RebuildSource = 'snapshot' | 'production';

type RebuildContract = {
  /** Tables that must hold no rows once the data stage has finished. */
  empty: readonly TableNames[];
  /** Tables that must hold rows; an empty one means the data never landed. */
  required: readonly TableNames[];
  /** Tables that must hold exactly one row, the snapshot's placeholder owner. */
  placeholderOnly: readonly TableNames[];
};

/**
 * What a deployment must hold once its data stage has loaded production data, which `provisioningChecks:assertRebuildContract` checks.
 *
 * `satisfies` turns a table rename into a compile error, so a renamed table can never be silently "cleared" by an empty import that quietly creates it instead.
 */
export const REBUILD_CONTRACTS = {
  /**
   * The snapshot leaves the `empty` tables out, and `import --replace-all` empties every table the file leaves out.
   * Of `users` and `profiles` it carries only the placeholder owner, which owns every kept row.
   * The snapshot policy in scripts/lib/snapshot-policy.ts drops exactly the tables on these two lists, and typecheck holds them to each other.
   */
  snapshot: {
    empty: [
      'authAccounts',
      'authSessions',
      'authRefreshTokens',
      'authVerificationCodes',
      'authVerifiers',
      'authRateLimits',
      'play_games',
      'play_tickets',
      'play_auth_registrations',
      'play_game_accounts',
      'play_account_deletions',
      'user_image_ingest_tokens',
      'account_deletion_operations',
      'account_deletion_items',
      'group_members',
      'faq_answers',
      'rulebook_drafts',
      'publication_jobs',
      'publication_assets',
      'admin_settings',
      'counters',
      'migration_runs',
    ],
    required: ['factions'],
    placeholderOnly: ['users', 'profiles'],
  },
  /**
   * A raw clone keeps everything in the export, users with their email and sign-in accounts included, and then clears these tables.
   * The auth session and token tables are bound to production's signing keys, and publication-queue rows are work claims that must never be acted on outside production.
   */
  production: {
    empty: [
      'authSessions',
      'authRefreshTokens',
      'authVerificationCodes',
      'authVerifiers',
      'authRateLimits',
      'publication_jobs',
      'publication_assets',
    ],
    required: ['factions', 'users', 'authAccounts'],
    placeholderOnly: [],
  },
} as const satisfies Record<RebuildSource, RebuildContract>;
