import type * as TanStackRouter from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackRouter>();
  return { ...actual, createFileRoute: () => (options: unknown) => ({ options }) };
});
vi.mock('@db/faq', () => ({
  loadGlobalFaqPage: vi.fn(),
  loadGlobalFaqRulesetOptions: vi.fn(async () => []),
  useGlobalFaqPage: vi.fn(),
  useGlobalFaqRulesetOptions: vi.fn(),
}));

import { loadGlobalFaqPage } from '@db/faq';

import { Route } from './index';

type HeadResult = {
  links?: { rel: string; href: string }[];
  meta?: { name?: string; property?: string; content?: string; title?: string }[];
};
type RouteOptions = {
  head: (context: { match: { status: string; search: Record<string, unknown> } }) => HeadResult;
  loaderDeps: (context: { search: Record<string, unknown> }) => unknown;
  loader: (context: { deps: { q?: string; rulesets: string[]; page?: number } }) => Promise<unknown>;
};
const { head, loaderDeps, loader } = (Route as unknown as { options: RouteOptions }).options;

const page = (search: Record<string, unknown>) => head({ match: { status: 'success', search } });

describe('the global FAQ head', () => {
  it('names the FAQ at its one address before any search', () => {
    const result = page({});
    expect(result.links).toContainEqual({ rel: 'canonical', href: 'https://dune.zone/faq' });
    expect(result.meta).toContainEqual({ title: 'Community FAQ · Dune Zone' });
    expect(result.meta?.some((tag) => tag.name === 'robots')).toBe(false);
  });

  it('has no numbered pages of its own, as only a search has pages', () => {
    const result = page({ page: '3' });
    expect(result.links).toContainEqual({ rel: 'canonical', href: 'https://dune.zone/faq' });
    expect(result.meta).toContainEqual({ title: 'Community FAQ · Dune Zone' });
    expect(result.meta?.some((tag) => tag.name === 'robots')).toBe(false);
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

  it('answers a page past the end of a search as one that does not exist, naming the last page', async () => {
    const searched = { selected: [], searched: true, items: [], total: 30, complete: true, pageCount: 2, pageSize: 24 };
    vi.mocked(loadGlobalFaqPage).mockImplementation(async (args) => ({ ...searched, page: args.page ?? 1 }));
    await expect(loader({ deps: { q: 'storm', rulesets: [], page: 3 } })).rejects.toMatchObject({
      isNotFound: true,
      data: { pageCount: 2 },
    });
    await expect(loader({ deps: { q: 'storm', rulesets: [], page: 2 } })).resolves.toMatchObject({
      page: { page: 2, pageCount: 2 },
      rulesets: [],
    });
  });
});
