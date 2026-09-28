import type { PublicAssetCaptureStatus, PublicAssetPublishingStatus } from '@db/factions';

/** Where an editor is in its save cycle. */
export type AuthoringSaveState = 'idle' | 'saving' | 'saved' | 'error';

const statusCopy: Record<PublicAssetPublishingStatus, string> = {
  current: 'Public assets are current.',
};

/** Where a faction's public assets have got to, whatever its editor's save cycle is doing. */
export function factionAssetPublishingCopy(
  status: PublicAssetPublishingStatus | null,
  capture: PublicAssetCaptureStatus | null = null
) {
  /* A failed replacement leaves the current publication in place (CONTEXT.md, Asset publication state), so it reads as no capture at all. */
  const captureStatus = capture === 'error' ? null : capture;

  switch (true) {
    case captureStatus === 'in_progress':
      return `A new faction sheet capture is in progress.${status === 'current' ? ' The current PDF remains available.' : ''}`;
    case captureStatus === 'scheduled':
      return `A new faction sheet capture is scheduled.${status === 'current' ? ' The current PDF remains available.' : ''}`;
    case status !== null:
      return statusCopy[status];
    default:
      return 'The public asset will be available soon.';
  }
}
