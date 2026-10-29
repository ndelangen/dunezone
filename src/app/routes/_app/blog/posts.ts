import { BLOG_POST_SLUGS } from '@shared/blogPostSlugs';
import type { BlogPostSlug } from '@shared/blogPostSlugs';
import { resolveAsset } from '@shared/media/resolveAsset';

/*
 * What the post list, the page head and the sitemap know about each post, without its body.
 * Bodies live in `postBodies.ts`, one chunk per post, which only the post page loads, so no other page downloads them.
 */

export type BlogPostMeta = {
  /** The last segment of the post's address. */
  slug: BlogPostSlug;
  title: string;
  /** The publication date, as `YYYY-MM-DD`. */
  date: string;
  author: string;
  /** One or two sentences for the post list, the search snippet and the social card. */
  summary: string;
  /**
   * A raster key from `media/`, resolved through the media pipeline, with its height over width.
   * It is the image in the post's structured data, and the post shows it with `Figure`.
   */
  cover: { key: string; alt: string; aspect: number };
};

/**
 * Every published post's metadata, by slug.
 * Publishing a post is adding its slug to `BLOG_POST_SLUGS`, its metadata here, and its body to `postBodies.ts`;
 * the types refuse a slug that is missing from either, and `postBodies.test.tsx` refuses a body that does not end on a picture.
 * A body file under `posts/` is named for its slug, never `index.tsx` or `*.route.tsx`, which the router would read as a page.
 * A folder beside it, like `posts/anatomy/`, holds that post's own figures and follows the same naming rule.
 */
export const BLOG_POST_META: Record<BlogPostSlug, BlogPostMeta> = {
  'anatomy-of-a-dune-faction-atreides': {
    slug: 'anatomy-of-a-dune-faction-atreides',
    title: 'Anatomy of a Dune faction: how House Atreides becomes every card, token and sheet',
    date: '2026-10-28',
    author: 'Central419',
    summary:
      'House Atreides, taken apart: the logo, colours, leaders and rules it is made of, and how dune.zone draws every card, token and sheet from that one faction.',
    cover: {
      key: '/web/blog/anatomy-of-a-dune-faction-atreides/atreides-table-spread.jpg',
      alt: 'House Atreides laid out on a table: its shield, both faction sheet pages, five traitor cards, the alliance card, leader tokens, faction token and troops',
      aspect: 1189 / 1331,
    },
  },
  'building-a-dune-sandbox': {
    slug: 'building-a-dune-sandbox',
    title: "Playing Dune online: why I'm building a sandbox for homebrew",
    date: '2026-10-25',
    author: 'Central419',
    summary:
      'Why I love Treachery.Online, why my group still plays Dune on Tabletop Simulator, and why I want a sandbox in the browser with room for homebrew.',
    cover: {
      key: '/web/blog/building-a-dune-sandbox/game-table.jpg',
      alt: 'The dune.zone game table during the spice blow: the Dune board with troops, faction shields and the treachery deck',
      aspect: 1019 / 2048,
    },
  },
  'dune-board-game-style-guide': {
    slug: 'dune-board-game-style-guide',
    title: 'The unofficial Dune board game style guide: every font, colour and texture in the GF9 edition',
    date: '2026-10-23',
    author: 'Central419',
    summary:
      'The fonts Gale Force Nine used in Dune and where each one appears, the colours of every faction and card, the textures and frames under them, and how the leader portraits changed from the base game to Ecaz & Moritani.',
    cover: {
      key: '/web/blog/dune-board-game-style-guide/faction-palette.jpg',
      alt: 'Swatch cards for twelve Dune factions, each with its token, its light and shade colours in hex and its texture number',
      aspect: 1330 / 1792,
    },
  },
  'drawing-dune-tokens-and-cards': {
    slug: 'drawing-dune-tokens-and-cards',
    title: 'Recreating Dune board game art, layer by layer',
    date: '2026-10-18',
    author: 'Central419',
    summary:
      'How I built the leader tokens and cards on dune.zone, from images cut out in GIMP in 2021 to the SVG layers, masks and textures that draw them today.',
    cover: {
      key: '/web/blog/drawing-dune-tokens-and-cards/exploded-layers.jpg',
      alt: 'A treachery card back and a leader token pulled apart into their layers, floating one above the other',
      aspect: 1800 / 2400,
    },
  },
  'all-in-one-dune-board-game-webapp': {
    slug: 'all-in-one-dune-board-game-webapp',
    title: 'My earlier attempts at building an all-in-one webapp for the Dune board game',
    date: '2026-10-16',
    author: 'Central419',
    summary:
      'Long before this site, I built a stats dashboard, a card creator, a database-free prototype and a repository that drew its own images. Each was a different answer to the same two questions: where does the data live, and who turns it into images?',
    cover: {
      key: '/web/blog/running-from-databases/dune-assets.jpg',
      alt: 'Generated Dune cards and tokens: a Duncan Idaho traitor card, Crysknife, an Atreides alliance card, a spice card and faction tokens',
      aspect: 1062 / 2048,
    },
  },
  'tabletop-simulator': {
    slug: 'tabletop-simulator',
    title: 'Building Dune on Tabletop Simulator',
    date: '2026-10-15',
    author: 'Central419',
    summary:
      "Before dune.zone there was Tabletop Simulator: the scripts and models I added to the community's Dune mod, the mods I built on my own, and how the tedium of making assets by hand led me to the fundamentals.",
    cover: {
      key: '/web/blog/tabletop-simulator/faction-tables.jpg',
      alt: 'Tabletop Simulator tables for many Dune factions, floating among the stars',
      aspect: 819 / 1080,
    },
  },
  'why-dune': {
    slug: 'why-dune',
    title: 'Why Dune?',
    date: '2026-10-14',
    author: 'Central419',
    summary:
      'How a YouTube recommendation, a Discord server and a lot of lockdown evenings drew me into Dune, and how a group of players writing their own rules led to dune.zone.',
    cover: {
      key: '/web/blog/why-dune/tts-central419.jpg',
      alt: 'A Dune table in Tabletop Simulator, floating among the stars',
      aspect: 1416 / 2048,
    },
  },
};

/** Every published post, newest first, in the order of `BLOG_POST_SLUGS`. */
export const BLOG_POSTS: readonly BlogPostMeta[] = BLOG_POST_SLUGS.map((slug) => BLOG_POST_META[slug]);

export function findBlogPost(slug: string): BlogPostMeta | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

/** Only verified author profiles become links; another author keeps their written byline. */
const AUTHOR_PROFILES = new Map([['Central419', 'central']]);

export function blogPostAuthor(meta: BlogPostMeta): { name: string; profileSlug?: string } {
  return { name: meta.author, profileSlug: AUTHOR_PROFILES.get(meta.author) };
}

/**
 * The cover at its small tier, for the post's structured data and its social card.
 * The card renderer refuses artwork over two megapixels, which a portrait cover's large tier can exceed.
 */
export function blogPostImage(meta: BlogPostMeta): string {
  return resolveAsset(meta.cover.key, 'small');
}
