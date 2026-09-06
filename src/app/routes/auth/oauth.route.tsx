import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

const confirmFn = createServerFn({ method: 'GET' })
  .validator((searchParams: unknown) => {
    if (searchParams && typeof searchParams === 'object' && 'next' in searchParams) {
      return searchParams;
    }
    throw new Error('Invalid search params');
  })
  .handler(async (ctx) => {
    const searchParams = ctx.data;
    const _next = (searchParams.next ?? '/') as string;
    const next = _next?.startsWith('/') ? _next : '/';

    // OAuth callback handling is managed by Convex Auth routes.
    throw redirect({ href: next });
  });

export const Route = createFileRoute('/auth/oauth')({
  preload: false,
  loader: (opts) => confirmFn({ data: opts.location.search }),
});
