import type { PublicAssetCaptureStatus, PublicAssetPublishingStatus } from '@db/factions';

/** Where an editor is in its save cycle. */
export type AuthoringSaveState = 'idle' | 'saving' | 'saved' | 'error';

const statusCopy: Record<PublicAssetPublishingStatus, string> = {
  current: 'Public assets are current.',
};

/** Where a faction's public assets have got to, whatever its editor's save cycle is doing. */
export function factionAssetPublishingCopy(
  status: PublicAssetPublishingStatus | null,
  capture: PublicAssetCaptureStatus | null = null,
  { viewerCanEdit = false }: { viewerCanEdit?: boolean } = {}
) {
  /*
   * A failed replacement leaves the current publication in place (CONTEXT.md, Asset publication state).
   * Someone who can edit the faction is told the latest changes did not make it into the sheet (#1385); to a reader it is no capture at all.
   */
  const captureStatus = capture === 'error' && !viewerCanEdit ? null : capture;

  switch (true) {
    case captureStatus === 'error':
      return status === 'current'
        ? 'The previous faction sheet is still published, but the latest changes were not captured.'
        : 'The latest changes were not captured, so no faction sheet is published yet.';
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
