import type { PublicAssetPublishingStatus } from '../../../convex/assetPublishingStatus';

export type FactionSaveState = 'idle' | 'saving' | 'saved' | 'error';

const statusCopy: Record<PublicAssetPublishingStatus, string> = {
  current: 'Public assets are current.',
};

export function factionAssetPublishingCopy(
  status: PublicAssetPublishingStatus | null,
  saveState: FactionSaveState = 'idle'
) {
  if (saveState === 'saving') return 'Saving changes…';
  if (saveState === 'error') return 'Changes were not saved.';

  const publishingCopy = status ? statusCopy[status] : 'The public asset will be available soon.';
  return saveState === 'saved' ? `Saved. Publication scheduled. ${publishingCopy}` : publishingCopy;
}
