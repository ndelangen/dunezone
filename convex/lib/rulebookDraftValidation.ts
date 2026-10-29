import { ConvexError } from 'convex/values';

import type { RulebookContentsV1 } from '../../src/shared/rulebooks/contents';
import {
  rulebookDraftCompatibilityError,
  rulebookCoverImagesError,
} from '../../src/shared/rulebooks/draftCompatibility';
import type { RulebookSettings } from '../../src/shared/rulebooks/settings';
import { rulebookCoverImageOrigins } from './rulebookCoverImage';

export function assertRulebookDraftCompatibility(
  previous: RulebookContentsV1,
  next: RulebookContentsV1,
  settings: RulebookSettings,
  previousSettings?: RulebookSettings
) {
  const error =
    rulebookDraftCompatibilityError(previous, next, settings, previousSettings) ??
    rulebookCoverImagesError(next, rulebookCoverImageOrigins());
  if (error) {
    throw new ConvexError(error);
  }
}
