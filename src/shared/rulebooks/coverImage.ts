import { z } from 'zod';

import {
  USER_IMAGE_LOCAL_HOSTS,
  userImageIngestCallbackSchema,
  userImageSourceUrlSchema,
} from '../user-images/contract';

export const RULEBOOK_COVER_IMAGE_ORIGIN = 'https://dune.zone';

/* Older stored covers reach 3000 pixels; new ingestion keeps its own smaller encoder limit. */
const storedCoverDimensionSchema = z.number().int().min(1).max(3000);

/** The stored rendition and the author's source travel together through Save and immutable Editions. */
export const rulebookCoverImageSchema = userImageIngestCallbackSchema.pick({ url: true }).extend({
  width: storedCoverDimensionSchema,
  height: storedCoverDimensionSchema,
  url: userImageIngestCallbackSchema.shape.url.refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.origin === RULEBOOK_COVER_IMAGE_ORIGIN || USER_IMAGE_LOCAL_HOSTS.has(url.hostname)) &&
        url.username === '' &&
        url.password === '' &&
        url.search === '' &&
        url.hash === ''
      );
    } catch {
      return false;
    }
  }, 'Use a stored Dune Zone cover image'),
  sourceUrl: userImageSourceUrlSchema,
});

export type RulebookCoverImage = z.infer<typeof rulebookCoverImageSchema>;
