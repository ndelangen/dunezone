import preview from '@sb/preview';

import {
  activeAccount,
  bannedAccount,
  bannedViewer,
  failedBanOperation,
  managedAccountPath,
} from './adminAccount.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({ title: 'Admin/Account', ...pageStoryMeta });

export const Active = meta.story({ args: { path: managedAccountPath }, parameters: { database: activeAccount } });
export const Banned = meta.story({ args: { path: managedAccountPath }, parameters: { database: bannedAccount } });
export const BannedSession = meta.story({ args: { path: '/' }, parameters: { database: bannedViewer } });

export const FailedOperation = meta.story({
  args: { path: managedAccountPath },
  parameters: { database: failedBanOperation },
});
