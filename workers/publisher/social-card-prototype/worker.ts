/* Local visual review only. No database client, publication job or R2 binding. */
import { Buffer } from 'node:buffer';

import type { Variant } from './card';
import { render } from './renderer';

export default {
  async fetch(request, env) {
    if (process.env.NODE_ENV === 'production') return new Response('Prototype unavailable', { status: 404 });
    const url = new URL(request.url);
    if (url.pathname === '/og.png') {
      const variant = url.searchParams.get('variant') ?? 'A';
      const name = url.searchParams.get('name') ?? '';
      const text = url.searchParams.get('text') ?? '';
      const kind = url.searchParams.get('kind') ?? 'Asset';
      const shape = url.searchParams.get('shape') ?? 'portrait';
      const art = url.searchParams.get('art') ?? '';
      if (
        !['A', 'B', 'C'].includes(variant) ||
        name.length > 180 ||
        text.length > 500 ||
        kind.length > 40 ||
        !['round', 'portrait', 'landscape'].includes(shape) ||
        (art && !['faction', 'card', 'round', 'landscape', 'deck'].includes(art))
      )
        return new Response('Invalid prototype input', { status: 400 });
      let artwork = '';
      if (art) {
        const response = await env.ASSETS.fetch(new Request(new URL(`/art/${art}.jpg`, url)));
        if (response.ok)
          artwork = `data:image/jpeg;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
      }
      const started = performance.now();
      const { png } = await render({ name, text, kind, shape, artwork }, variant as Variant);
      return new Response(png, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
          'X-Prototype-Render-Ms': String(Math.round(performance.now() - started)),
          'X-Prototype-Database-Calls': '0',
        },
      });
    }
    if (url.pathname === '/' || url.pathname === '/prototype/social-cards/')
      return env.ASSETS.fetch(new Request(new URL('/index.html', url)));
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
