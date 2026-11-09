import { publicPageHead } from '@app/routes/publicPage';

import { toolPath, TOOLS } from './tools';
import type { Tool, ToolSlug } from './tools';

/*
 * The search and sharing identity of the tools catalogue and of every built tool, in one place.
 * A built tool's route calls `toolPageHead` with its slug and a description written for a search result.
 * The address, the breadcrumb back to /tools, the free web app structured data and the share picture all come from the registry.
 */

/** Every tool tile picture in public/tools is a WebP of this size; a test holds the files to it. */
export const TOOL_ART = { type: 'image/webp', width: 640, height: 400 } as const;

/** A tool's large copy of its picture, which its links share when it has one. */
export const TOOL_LARGE_ART = { type: 'image/webp', width: 1280, height: 800 } as const;

/* The picture a tool's links share: its large copy, else its tile picture. */
function shareArt(tool: Tool) {
  if (tool.largeArt) {
    return { image: tool.largeArt, size: TOOL_LARGE_ART };
  }
  return tool.art ? { image: tool.art, size: TOOL_ART } : undefined;
}

/* The catalogue's one name, for its own title and for the breadcrumb on every tool page. */
const CATALOGUE = { name: 'Tools for the Dune board game', pathname: '/tools' } as const;
const KIND = 'Tools';

/** What the catalogue says in a search result and when shared. */
const TOOLS_DESCRIPTION =
  'Free phone-friendly helpers for playing the Dune board game at the table: a Treachery card tracker, spice deck, faction draft, battle calculator and more.';

/** The /tools head: a collection page that lists the built tools, and a social card. */
export function toolsIndexHead(tools: readonly Tool[] = TOOLS) {
  return publicPageHead({
    name: CATALOGUE.name,
    kind: KIND,
    pathname: CATALOGUE.pathname,
    description: TOOLS_DESCRIPTION,
    social: { shape: 'portrait' },
    trail: [],
    entity: {
      type: 'collection',
      items: tools.filter((tool) => tool.built).map((tool) => ({ name: tool.title, pathname: toolPath(tool) })),
    },
  });
}

type ToolHeadOptions = {
  /** The search result's words: what the tool does at the table, ideally 120 to 160 characters, naming the Dune board game. */
  description: string;
  match?: { status: string };
};

/**
 * A built tool's head, named by its registry title so the catalogue's list and the page agree.
 * The share picture is the tool's large picture (`largeArt`) or else its tile picture (`art`), and a tool without either shares a social card instead.
 * Public for the built tools' routes, which ship from their own branches.
 * @public
 */
export function toolPageHead(slug: ToolSlug, options: ToolHeadOptions) {
  return toolHead(
    TOOLS.find((tool) => tool.slug === slug)!,
    options
  );
}

/** `toolPageHead` for a tool in hand. */
export function toolHead(tool: Tool, { description, match }: ToolHeadOptions) {
  const art = shareArt(tool);
  return publicPageHead({
    name: tool.title,
    kind: KIND,
    pathname: toolPath(tool),
    description,
    ...(art
      ? { image: art.image, imageDetails: { alt: `${tool.title}: ${tool.goal}`, ...art.size } }
      : { social: { shape: 'portrait' as const } }),
    trail: [CATALOGUE],
    entity: { type: 'app' },
    match,
  });
}
