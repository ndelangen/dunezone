import type * as TanStackRouter from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackRouter>();
  return { ...actual, createFileRoute: () => (options: unknown) => ({ options }) };
});
vi.mock('@db/profiles', () => ({ useSessionViewer: () => undefined }));
const savedBoard = vi.hoisted(() => ({ assetId: 'arrakis-board', name: 'Arrakis Official' }));
vi.mock('@db/arrakis', () => ({ ArrakisBoardSeedProvider: () => null, loadArrakisBoard: async () => savedBoard }));

import { Route } from './index';

type HeadResult = { links?: { rel: string; href: string }[]; meta?: { property?: string; content?: string }[] };
const head = (Route as unknown as { options: { head: (context: { loaderData?: unknown }) => HeadResult } }).options
  .head;

describe('the homepage head', () => {
  it('names the homepage when its loader ran', async () => {
    const loader = (Route as unknown as { options: { loader: () => Promise<unknown> } }).options.loader;
    const result = head({ loaderData: await loader() });
    expect(result.links).toContainEqual({ rel: 'canonical', href: 'https://dune.zone/' });
    expect(result.meta).toContainEqual({ property: 'og:url', content: 'https://dune.zone/' });
  });

  it('renders the whole page on the server, so crawlers get its chapters without JavaScript', () => {
    expect((Route as unknown as { options: { ssr: unknown } }).options.ssr).toBe(true);
  });

  it('embeds the saved Arrakis board in the page, so its table draws it without a query', async () => {
    const loader = (Route as unknown as { options: { loader: () => Promise<{ arrakis: unknown }> } }).options.loader;
    await expect(loader()).resolves.toMatchObject({ arrakis: savedBoard });
  });

  it('leaves the SPA shell, which runs no loaders below the root, without a page identity', () => {
    expect(head({ loaderData: undefined })).toEqual({});
  });
});
