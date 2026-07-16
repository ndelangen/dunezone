import type { PublicAssetPublishingStatus } from '../../../convex/assetPublishingStatus';

export type FactionSaveState = 'idle' | 'saving' | 'saved' | 'error';

const statusCopy: Record<PublicAssetPublishingStatus, string> = {
  waiting: 'Assets are waiting to publish automatically.',
  publishing: 'Assets are publishing automatically.',
  delayed: 'Asset publishing is delayed and will retry automatically.',
  current: 'Public assets are current.',
};

export function factionAssetPublishingCopy(
  status: PublicAssetPublishingStatus | null,
  saveState: FactionSaveState = 'idle'
) {
  if (saveState === 'saving') return 'Saving changes…';
  if (saveState === 'error') return 'Changes were not saved.';

  const publishingCopy = status
    ? statusCopy[status]
    : 'Public asset publishing is not available yet.';
  return saveState === 'saved' ? `Saved immediately. ${publishingCopy}` : publishingCopy;
}
