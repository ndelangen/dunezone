import { LEADERS } from '@shared/assetIds';

import portraits from './approvedLeaders.stories.fixture.json';

export const approvedLeaderSets = portraits.map((set) => ({
  ...set,
  leaders: set.leaders.map((leader) => ({
    ...leader,
    image: LEADERS.parse(leader.image),
  })),
}));
