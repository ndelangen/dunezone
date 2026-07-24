import { describe, expect, it } from 'vitest';

import {
  CONVENTIONAL_SUPPORTING_LEADER_COUNT,
  canAddSupportingLeader,
  SUPPORTING_LEADER_LIMIT,
} from './FactionFormSectionLeaders';

describe('supporting leader limits', () => {
  it('treats zero and ten leaders as valid normal-control states', () => {
    expect(canAddSupportingLeader(0)).toBe(true);
    expect(canAddSupportingLeader(SUPPORTING_LEADER_LIMIT - 1)).toBe(true);
    expect(canAddSupportingLeader(SUPPORTING_LEADER_LIMIT)).toBe(false);
    expect(canAddSupportingLeader(SUPPORTING_LEADER_LIMIT + 1)).toBe(false);
  });

  it('keeps the conventional count distinct from the hard upper boundary', () => {
    expect(CONVENTIONAL_SUPPORTING_LEADER_COUNT).toBe(5);
    expect(SUPPORTING_LEADER_LIMIT).toBe(10);
  });
});
