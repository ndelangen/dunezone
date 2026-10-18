import type * as TanStackRouter from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackRouter>();
  return { ...actual, createFileRoute: () => (options: unknown) => ({ options }) };
});
vi.mock('@db/core', () => ({ db: { query: vi.fn() } }));

import { Route } from './index';

type HeadResult = {
  links?: { rel: string; href: string }[];
  meta?: { name?: string; property?: string; content?: string; title?: string }[];
};
type RouteOptions = {
  head: (context: { match: { status: string; search: Record<string, unknown> } }) => HeadResult;
  loaderDeps: (context: { search: Record<string, unknown> }) => unknown;
};
const { head, loaderDeps } = (Route as unknown as { options: RouteOptions }).options;

const page = (search: Record<string, unknown>) => head({ match: { status: 'success', search } });

describe('the global FAQ head', () => {
  it('names the FAQ at its one address before any search', () => {
    const result = page({});
    expect(result.links).toContainEqual({ rel: 'canonical', href: 'https://dune.zone/faq' });
    expect(result.meta).toContainEqual({ title: 'Community FAQ · Dune Zone' });
    expect(result.meta?.some((tag) => tag.name === 'robots')).toBe(false);
  });

  it('numbers a later page of the plain FAQ, which has an address of its own', () => {
    const result = page({ page: '3' });
    expect(result.links).toContainEqual({ rel: 'canonical', href: 'https://dune.zone/faq?page=3' });
    expect(result.meta).toContainEqual({ title: 'Community FAQ, page 3 · Dune Zone' });
  });

  it('keeps a search, and a ruleset pick, out of search engines', () => {
    for (const search of [{ q: 'storm' }, { rulesets: 'dreamrules' }, { q: 'storm', page: '2' }]) {
      const result = page(search);
      expect(result.meta).toContainEqual({ name: 'robots', content: 'noindex' });
      expect(result.links).toContainEqual({ rel: 'canonical', href: 'https://dune.zone/faq' });
    }
  });

  it('leaves a not-found page without an identity, so the layout names it', () => {
    expect(head({ match: { status: 'notFound', search: {} } })).toEqual({});
  });

  it('spells out every query argument, so the loader deps compare equal however the address was written', () => {
    expect(loaderDeps({ search: { q: 'storm', rulesets: 'advanced,dune-2019', page: 2 } })).toEqual({
      q: 'storm',
      rulesets: ['advanced', 'dune-2019'],
      page: 2,
    });
    expect(loaderDeps({ search: {} })).toEqual({ q: undefined, rulesets: [], page: undefined });
  });
});
