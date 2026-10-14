import { countOf } from '@app/routes/publicPage';

/** What a member has shared, counted, so each profile's search snippet is its own rather than one sentence for everyone. */
export function profileDescription({
  username,
  factions,
  groups,
  faqContributions,
}: {
  username: string | null;
  factions: number;
  groups: number;
  faqContributions: number;
}): string {
  const name = username ?? 'This member';
  const shared = [
    factions ? countOf(factions, 'faction') : '',
    groups ? countOf(groups, 'Group') : '',
    faqContributions ? countOf(faqContributions, 'FAQ contribution') : '',
  ].filter(Boolean);
  if (!shared.length) {
    const who = username ? `${username} is a member` : 'A member';
    return `${who} of Dune Zone, the community workshop for Dune factions, cards and Rulesets.`;
  }
  const last = shared.pop();
  return `${name} on Dune Zone: ${shared.length ? `${shared.join(', ')} and ${last}` : last}.`;
}
