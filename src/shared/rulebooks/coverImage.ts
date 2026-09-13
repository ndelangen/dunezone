import type { z } from 'zod';

import {
  USER_IMAGE_LOCAL_HOSTS,
  userImageIngestCallbackSchema,
  userImageSourceUrlSchema,
} from '../user-images/contract';

export const RULEBOOK_COVER_IMAGE_ORIGIN = 'https://dune.zone';

/** The stored rendition and the author's source travel together through Save and immutable Editions. */
export const rulebookCoverImageSchema = userImageIngestCallbackSchema
  .pick({ url: true, width: true, height: true })
  .extend({
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
