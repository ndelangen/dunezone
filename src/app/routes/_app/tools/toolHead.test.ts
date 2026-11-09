import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vite-plus/test';

import { TOOL_ART, toolHead, toolPageHead, toolsIndexHead } from './toolHead';
import { toolPath, TOOLS } from './tools';

type Meta = Record<string, unknown>;
const metaOf = (head: { meta?: unknown[] }) => (head.meta ?? []) as Meta[];
const contentOf = (head: { meta?: unknown[] }, key: string) =>
  metaOf(head).find((meta) => meta.property === key || meta.name === key)?.content;
const graphOf = (head: { meta?: unknown[] }) =>
  (metaOf(head).find((meta) => 'script:ld+json' in meta)?.['script:ld+json'] as { '@graph': Meta[] } | undefined)?.[
    '@graph'
  ] ?? [];

const here = fileURLToPath(new URL('.', import.meta.url));
const publicFolder = fileURLToPath(new URL('../../../../../public', import.meta.url));

/** Width and height from a WebP's header: lossy (VP8), lossless (VP8L) or extended (VP8X). */
function webpSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }
  switch (bytes.toString('ascii', 12, 16)) {
    case 'VP8 ':
      return { width: bytes.readUInt16LE(26) & 0x3f_ff, height: bytes.readUInt16LE(28) & 0x3f_ff };
    case 'VP8L': {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3f_ff) + 1, height: ((bits >> 14) & 0x3f_ff) + 1 };
    }
    case 'VP8X':
      return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    default:
      return null;
  }
}

function sourcesBelow(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourcesBelow(join(folder, entry.name))
      : /\.tsx?$/.test(entry.name) && !/\.(test|stories)\./.test(entry.name)
        ? [readFileSync(join(folder, entry.name), 'utf8')]
        : []
  );
}

describe('tools catalogue head', () => {
  test('lists the built tools for search, under a breadcrumb back home', () => {
    const graph = graphOf(toolsIndexHead());
    expect(graph[0]).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { name: 'Dune Zone' },
        { name: 'Tools for the Dune board game', item: 'https://dune.zone/tools' },
      ],
    });
    const listed = (graph[1] as { mainEntity?: { itemListElement: Meta[] } }).mainEntity?.itemListElement ?? [];
    expect(graph[1]).toMatchObject({ '@type': 'CollectionPage', url: 'https://dune.zone/tools' });
    expect(listed.map((item) => item.url)).toEqual(
      TOOLS.filter((tool) => tool.built).map((tool) => `https://dune.zone${toolPath(tool)}`)
    );
  });

  test('has a canonical address and a description that fits a search result', () => {
    const head = toolsIndexHead();
    expect(head.links).toEqual([{ rel: 'canonical', href: 'https://dune.zone/tools' }]);
    expect(String(contentOf(head, 'description')).length).toBeLessThanOrEqual(160);
  });
});

describe('a tool page head', () => {
  /* Any registry entry will do; the test passes it in so it holds whatever the registry is renamed to. */
  const tool = TOOLS[0];
  const description = 'Draw the spice deck for your game of Dune on a phone.';

  test('is a free web app below the catalogue, at its own canonical address', () => {
    const head = toolPageHead(tool.slug, { description });
    expect(head.links).toEqual([{ rel: 'canonical', href: `https://dune.zone${toolPath(tool)}` }]);
    expect(metaOf(head)).toContainEqual({ title: `${tool.title} · Tools · Dune Zone` });
    expect(contentOf(head, 'description')).toBe(description);
    expect(contentOf(head, 'robots')).toBeUndefined();
    const [trail, app] = graphOf(head);
    expect((trail.itemListElement as Meta[]).map((crumb) => crumb.name)).toEqual(['Dune Zone', 'Tools', tool.title]);
    expect(app).toMatchObject({
      '@type': 'WebApplication',
      name: tool.title,
      description,
      applicationCategory: 'GameApplication',
      isAccessibleForFree: true,
      offers: { price: '0' },
    });
  });

  test('shares its tile picture when it has one, and a social card until then', () => {
    const shared = toolHead({ ...tool, art: '/tools/example.webp' }, { description });
    expect(contentOf(shared, 'og:image')).toBe('https://dune.zone/tools/example.webp');
    expect(contentOf(shared, 'og:image:type')).toBe('image/webp');
    expect(contentOf(shared, 'og:image:width')).toBe('640');
    expect(contentOf(shared, 'og:image:height')).toBe('400');
    expect(contentOf(shared, 'twitter:image')).toBe('https://dune.zone/tools/example.webp');
    expect(graphOf(shared)[1].image).toBe('https://dune.zone/tools/example.webp');
    const card = toolHead({ ...tool, art: undefined }, { description, name: 'Spice deck' });
    expect(String(contentOf(card, 'og:image'))).toContain('/social/image.png');
    expect(metaOf(card)).toContainEqual({ title: 'Spice deck · Tools · Dune Zone' });
  });

  test('refuses a slug the registry does not know', () => {
    expect(() => toolPageHead('no-such-tool', { description })).toThrow();
  });
});

describe('tools registry', () => {
  test.each(TOOLS.filter((tool) => tool.art))('$title has its tile picture as a 640 by 400 WebP', (tool) => {
    expect(tool.art).toMatch(/^\/tools\/[\w-]+\.webp$/);
    expect(webpSize(readFileSync(join(publicFolder, tool.art!)))).toEqual({
      width: TOOL_ART.width,
      height: TOOL_ART.height,
    });
  });

  test('every built tool names itself for search through toolPageHead', () => {
    const sources = sourcesBelow(here).join('\n');
    for (const tool of TOOLS.filter((entry) => entry.built)) {
      expect(sources).toMatch(new RegExp(`toolPageHead\\(\\s*'${tool.slug}'`));
    }
  });
});
