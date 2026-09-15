/* Throwaway fixtures for the removal-vote placement comparison. */
export const VOTE_VARIANTS = ['A', 'B', 'C'] as const;
export type VoteVariant = (typeof VOTE_VARIANTS)[number];
export const VOTE_SCENARIOS = ['vote-open', 'vote-multiple', 'vote-target', 'vote-spectator', 'vote-resolved'] as const;
export type VoteScenario = (typeof VOTE_SCENARIOS)[number];
export function isVoteScenario(value: unknown): value is VoteScenario {
  return VOTE_SCENARIOS.includes(value as VoteScenario);
}
export const VOTE_NAMES: Record<VoteVariant, string> = { A: 'In the bar', B: 'Log > Audit', C: 'With the player' };
