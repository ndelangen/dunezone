/* Accepted voting placement with in-memory review scenarios. */
export const VOTE_SCENARIOS = [
  'vote-open',
  'vote-deciding',
  'vote-multiple',
  'vote-target',
  'vote-spectator',
  'vote-resolved',
] as const;
export type VoteScenario = (typeof VOTE_SCENARIOS)[number];
export function isVoteScenario(value: unknown): value is VoteScenario {
  return VOTE_SCENARIOS.includes(value as VoteScenario);
}
