import type * as TanStackRouter from '@tanstack/react-router';
import { expect, test, vi } from 'vite-plus/test';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackRouter>();
  return { ...actual, createFileRoute: () => (options: unknown) => ({ options }) };
});

import { Route } from './index';

type HeadResult = { meta?: { property?: string; content?: string }[] };
const head = (Route as unknown as { options: { head: (context: unknown) => HeadResult } }).options.head;

test('board metadata clips the published JPEG to the circular map', () => {
  const result = head({
    match: { status: 'success' },
    params: { type: 'board', slug: 'arrakis-with-palace' },
    loaderData: {
      asset: {
        name: 'Arrakis with Palace',
        slug: 'arrakis-with-palace',
        data: {},
        previewHref: '/published/boards/abcdefghijklmnop/board.jpg',
      },
    },
  });
  const image = result.meta?.find((meta) => meta.property === 'og:image')?.content;
  expect(image).toBeDefined();
  const url = new URL(image!);
  expect(url.searchParams.get('shape')).toBe('round');
  expect(url.searchParams.get('art')).toBe('/published/boards/abcdefghijklmnop/board.jpg');
});
