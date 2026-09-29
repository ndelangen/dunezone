import type * as TanStackRouter from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackRouter>();
  return { ...actual, createFileRoute: () => (options: unknown) => ({ options }) };
});
vi.mock('@app/shell/ApplicationChrome', () => ({ ApplicationChrome: () => null }));
vi.mock('@app/shell/AppNotFound', () => ({ AppNotFound: () => null }));

import { Route } from './route';

type HeadResult = { meta?: { title?: string }[]; scripts?: unknown[] };
const head = (Route as unknown as { options: { head: (context: { match: { status: string } }) => HeadResult } }).options
  .head;

describe('the _app layout head', () => {
  it('names the not-found page when this layout is the notFound boundary', () => {
    const result = head({ match: { status: 'notFound' } });
    expect(result.meta).toContainEqual({ title: 'Page not found · Dune Zone' });
    expect(result.scripts).toBeDefined();
  });

  it('leaves the title to the root and the child routes otherwise', () => {
    const result = head({ match: { status: 'success' } });
    expect(result.meta?.some((tag) => tag.title !== undefined) ?? false).toBe(false);
    expect(result.scripts).toBeDefined();
  });
});
