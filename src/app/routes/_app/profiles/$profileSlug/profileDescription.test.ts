import { describe, expect, test } from 'vite-plus/test';

import { profileDescription } from './profileDescription';

describe('profile descriptions', () => {
  test('count what the member has shared', () => {
    expect(profileDescription({ username: 'Feyd', factions: 4, groups: 2, faqContributions: 1 })).toBe(
      'Feyd on Dune Zone: 4 factions, 2 Groups and 1 FAQ contribution.'
    );
    expect(profileDescription({ username: 'Feyd', factions: 1, groups: 0, faqContributions: 0 })).toBe(
      'Feyd on Dune Zone: 1 faction.'
    );
  });

  test('still name a member who has shared nothing yet', () => {
    expect(profileDescription({ username: null, factions: 0, groups: 0, faqContributions: 0 })).toBe(
      'A member of Dune Zone, the community workshop for Dune factions, cards and Rulesets.'
    );
    expect(profileDescription({ username: 'Feyd', factions: 0, groups: 0, faqContributions: 0 })).toBe(
      'Feyd is a member of Dune Zone, the community workshop for Dune factions, cards and Rulesets.'
    );
  });
});
