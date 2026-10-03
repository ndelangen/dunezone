import { z } from 'zod';

import { ASSET_TYPES, ASSET_TYPE_KEYS } from './assets/types';

export const PUBLIC_SITE_ORIGIN = 'https://dune.zone';
export const SITEMAP_PAGE_SIZE = 200;
export const SITEMAP_COLLECTIONS = [
  'factions',
  ...ASSET_TYPE_KEYS.filter((type) => ASSET_TYPES[type].status === 'live'),
];

export const sitemapArgsSchema = z.object({
  collection: z.string().refine((value) => SITEMAP_COLLECTIONS.includes(value)),
  cursor: z.string().max(8192).nullable(),
});

export const sitemapPageSchema = z.object({
  entries: z.array(z.object({ pathname: z.string().max(2048), lastmod: z.string().nullable() })).max(SITEMAP_PAGE_SIZE),
  cursor: z.string().max(8192).nullable(),
});
export type SitemapArgs = z.infer<typeof sitemapArgsSchema>;
export type SitemapPage = z.infer<typeof sitemapPageSchema>;
