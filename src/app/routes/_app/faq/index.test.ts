import type * as TanStackRouter from '@tanstack/react-router';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

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
  loader: (context: { deps: { q?: string; rulesets: string[] } }) => Promise<unknown>;
};
const { head, loaderDeps, loader } = (Route as unknown as { options: RouteOptions }).options;

const page = (search: Record<string, unknown>) => head({ match: { status: 'success', search } });

beforeEach(() => {
  vi.mocked(loadGlobalFaqPage).mockReset();
});

describe('the global FAQ head', () => {
  it('names the FAQ at its one address before any search', () => {
    const result = page({});
    expect(result.links).toContainEqual({ rel: 'canonical', href: 'https://dune.zone/faq' });
    expect(result.meta).toContainEqual({ title: 'Community FAQ · Dune Zone' });
    expect(result.meta?.some((tag) => tag.name === 'robots')).toBe(false);
  });

  it('has no numbered pages, so an old page number is the one address', () => {
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
});

describe('the global FAQ loader', () => {
  it('spells out every query argument, so the loader deps compare equal however the address was written', () => {
    expect(loaderDeps({ search: { q: 'storm', rulesets: 'advanced,dune-2019', page: 2 } })).toEqual({
      q: 'storm',
      rulesets: ['advanced', 'dune-2019'],
    });
    expect(loaderDeps({ search: {} })).toEqual({ q: undefined, rulesets: [] });
  });

  it('asks the search for its first matches at the default limit, the one the page starts from', async () => {
    const searched = { selected: [], searched: true, items: [], hasMore: true, capped: false, limit: 24 };
    vi.mocked(loadGlobalFaqPage).mockResolvedValue(searched);
    await expect(loader({ deps: { q: 'storm', rulesets: ['advanced'] } })).resolves.toEqual({
      page: searched,
      rulesets: [],
    });
    expect(loadGlobalFaqPage).toHaveBeenCalledTimes(1);
    expect(loadGlobalFaqPage).toHaveBeenCalledWith({ q: 'storm', rulesets: ['advanced'], limit: 24 });
  });

  it('runs no search before anything is searched, so the plain page makes one query, for the picker', async () => {
    await expect(loader({ deps: { q: undefined, rulesets: ['advanced'] } })).resolves.toEqual({
      page: { selected: ['advanced'], searched: false, items: [], hasMore: false, capped: false, limit: 24 },
      rulesets: [],
    });
    expect(loadGlobalFaqPage).not.toHaveBeenCalled();
  });
});
