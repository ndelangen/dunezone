import type * as TanStackRouter from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackRouter>();
  return { ...actual, createFileRoute: () => (options: unknown) => ({ options }) };
});
vi.mock('@db/profiles', () => ({ useSessionViewer: () => undefined }));

import { Route } from './index';

type HeadResult = { links?: { rel: string; href: string }[]; meta?: { property?: string; content?: string }[] };
const head = (Route as unknown as { options: { head: (context: { loaderData?: unknown }) => HeadResult } }).options
  .head;

describe('the homepage head', () => {
  it('names the homepage when its loader ran', () => {
    const loader = (Route as unknown as { options: { loader: () => unknown } }).options.loader;
    const result = head({ loaderData: loader() });
    expect(result.links).toContainEqual({ rel: 'canonical', href: 'https://dune.zone/' });
    expect(result.meta).toContainEqual({ property: 'og:url', content: 'https://dune.zone/' });
  });

  it('renders the whole page on the server, so crawlers get its chapters without JavaScript', () => {
    expect((Route as unknown as { options: { ssr: unknown } }).options.ssr).toBe(true);
  });

  it('leaves the SPA shell, which runs no loaders below the root, without a page identity', () => {
    expect(head({ loaderData: undefined })).toEqual({});
  });
});
