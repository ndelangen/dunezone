import { SUPPORTING_LEADER_LIMIT } from '@shared/factions/schema';
import { describe, expect, it } from 'vite-plus/test';

import { canAddSupportingLeader } from './FactionFormSectionLeaders';

describe('supporting leader limits', () => {
  it('treats zero and ten leaders as valid normal-control states', () => {
    expect(canAddSupportingLeader(0)).toBe(true);
    expect(canAddSupportingLeader(SUPPORTING_LEADER_LIMIT - 1)).toBe(true);
    expect(canAddSupportingLeader(SUPPORTING_LEADER_LIMIT)).toBe(false);
    expect(canAddSupportingLeader(SUPPORTING_LEADER_LIMIT + 1)).toBe(false);
  });
});
