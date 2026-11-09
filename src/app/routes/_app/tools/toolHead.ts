import { publicPageHead } from '@app/routes/publicPage';

import { toolAt, toolPath, TOOLS } from './tools';
import type { Tool } from './tools';

/*
 * The search and sharing identity of the tools catalogue and of every built tool, in one place.
 * A built tool's route calls `toolPageHead` with its slug and a description written for a search result;
 * the address, the breadcrumb back to /tools, the free web app structured data and the share picture all come from the registry.
 */

/** Every tool tile picture in public/tools is a WebP of this size; a test holds the files to it. */
export const TOOL_ART = { type: 'image/webp', width: 640, height: 400 } as const;

const CATALOGUE = { name: 'Tools', pathname: '/tools' } as const;

/** What the catalogue says in a search result and when shared. */
export const TOOLS_DESCRIPTION =
  'Free phone-friendly helpers for playing the Dune board game at the table: a Treachery card tracker, spice deck, faction draft, battle calculator and more.';

/** The /tools head: a collection page that lists the built tools, and a social card. */
export function toolsIndexHead() {
  return publicPageHead({
    name: 'Tools for the Dune board game',
    kind: CATALOGUE.name,
    pathname: CATALOGUE.pathname,
    description: TOOLS_DESCRIPTION,
    social: { kind: CATALOGUE.name, shape: 'portrait' },
    trail: [],
    entity: {
      type: 'collection',
      items: TOOLS.filter((tool) => tool.built).map((tool) => ({ name: tool.title, pathname: toolPath(tool) })),
    },
  });
}

/**
 * A built tool's head.
 * `description` is the search result's words: what the tool does at the table, ideally 120 to 160 characters, naming the Dune board game.
 * `name` defaults to the tool's registry title, so pass one only when the page's heading says it differently.
 * The share picture is the tool's tile picture (`art` in the registry), and a tool without one shares a social card instead.
 */
export function toolPageHead(
  slug: string,
  { description, name, match }: { description: string; name?: string; match?: { status: string } }
) {
  const tool = toolAt(slug);
  if (!tool) {
    throw new Error(`No tool "${slug}" in the tools registry`);
  }
  return toolHead(tool, { description, name, match });
}

/** `toolPageHead` for a tool in hand. */
export function toolHead(
  tool: Tool,
  { description, name, match }: { description: string; name?: string; match?: { status: string } }
) {
  const title = name ?? tool.title;
  return publicPageHead({
    name: title,
    kind: CATALOGUE.name,
    pathname: toolPath(tool),
    description,
    ...(tool.art
      ? { image: tool.art, imageDetails: { alt: `${title}: ${tool.goal}`, ...TOOL_ART } }
      : { social: { kind: CATALOGUE.name, shape: 'portrait' as const } }),
    trail: [CATALOGUE],
    entity: { type: 'app' },
    match,
  });
}
