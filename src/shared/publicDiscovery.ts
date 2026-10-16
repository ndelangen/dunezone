import { z } from 'zod';

import { ASSET_TYPES, ASSET_TYPE_KEYS } from './assets/types';
import type { AssetType } from './assets/types';

export const PUBLIC_SITE_ORIGIN = 'https://dune.zone';
export const SITEMAP_PAGE_SIZE = 200;
/** Asset types with a public catalogue, each listed at `/assets/<type>` and in its own sitemap. */
export const SITEMAP_ASSET_COLLECTIONS: AssetType[] = ASSET_TYPE_KEYS.filter(
  (type) => ASSET_TYPES[type].status === 'live'
);
/** Record kinds with their own sitemap. Their names must never collide with an Asset type's. */
export const SITEMAP_RECORD_COLLECTIONS = ['factions', 'rulesets', 'rulebooks', 'faq', 'profiles', 'groups'];
export const SITEMAP_COLLECTIONS: string[] = [...SITEMAP_RECORD_COLLECTIONS, ...SITEMAP_ASSET_COLLECTIONS];

export const sitemapArgsSchema = z.object({
  collection: z.string().refine((value) => SITEMAP_COLLECTIONS.includes(value)),
  cursor: z.string().max(8192).nullable(),
});

export const sitemapPageSchema = z.object({
  entries: z
    .array(
      z.object({
        pathname: z.string().max(2048),
        lastmod: z.string().nullable(),
        /** The generated image the page shows as its own, by the same href its `<img>` uses. */
        image: z.string().max(2048).optional(),
      })
    )
    .max(SITEMAP_PAGE_SIZE),
  cursor: z.string().max(8192).nullable(),
});
export type SitemapArgs = z.infer<typeof sitemapArgsSchema>;
export type SitemapPage = z.infer<typeof sitemapPageSchema>;
