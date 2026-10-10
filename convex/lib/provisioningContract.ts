import type { Doc, TableNames } from '../_generated/dataModel';

type RebuildContract = {
  /** Tables that must hold no rows once the data stage has finished. */
  empty: readonly TableNames[];
  /** Tables the snapshot leaves out and the load then seeds from the published rows it kept, before the contract is checked. */
  seeded: readonly TableNames[];
  /** Tables that must hold rows; an empty one means the data never landed. */
  required: readonly TableNames[];
  /** Tables that must hold exactly one row, the snapshot's placeholder owner. */
  placeholderOnly: readonly TableNames[];
};

/**
 * What a deployment must hold once its data stage has loaded the anonymised, published-only snapshot (#1559), which `provisioningChecks:assertRebuildContract` checks.
 * Cloud dev and `app:dev --local --data=snapshot` load that snapshot, and nothing outside production loads a raw export.
 *
 * The snapshot leaves the `empty` and `seeded` tables out, and `import --replace-all` empties every table the file leaves out.
 * The load then seeds each `seeded` table from published rows alone: every live Rulebook gets a draft holding its current Edition as the public reader shows it, so its editor opens.
 * Of `users` and `profiles` it carries only the placeholder owner, which owns every kept row.
 * The snapshot policy in scripts/lib/snapshot-policy.ts drops exactly the tables on the `empty`, `seeded` and `placeholderOnly` lists, and typecheck holds them to each other.
 *
 * `satisfies` turns a table rename into a compile error, so the check never probes a table name the schema no longer has, which would always read as empty.
 */
export const SNAPSHOT_REBUILD_CONTRACT = {
  empty: [
    'authAccounts',
    'authSessions',
    'authRefreshTokens',
    'authVerificationCodes',
    'authVerifiers',
    'authRateLimits',
    'play_games',
    'play_game_slug_reservations',
    'play_game_slug_cursors',
    'homepage_tickets',
    'play_tickets',
    'play_auth_registrations',
    'play_game_accounts',
    'play_account_deletions',
    'user_image_ingest_tokens',
    'account_connections',
    'account_merge_operations',
    'account_deletion_operations',
    'account_deletion_items',
    'group_members',
    'faq_answers',
    'publication_jobs',
    'publication_assets',
    'admin_settings',
    'counters',
    'migration_runs',
  ],
  seeded: ['rulebook_drafts'],
  required: ['factions'],
  placeholderOnly: ['users', 'profiles'],
} as const satisfies RebuildContract;

/** Whether a `users` row says who someone is; the snapshot's placeholder owner carries no email, phone, name or image. */
export function identifiesSomeone(user: Doc<'users'>) {
  return [user.email, user.phone, user.name, user.image].some((value) => value !== undefined);
}
