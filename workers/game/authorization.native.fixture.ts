import { DurableObject } from 'cloudflare:workers';

import { AuthorizationWatch } from './authorization';

type ProbeEnv = { PEER_URL: string; PROBE: DurableObjectNamespace<AuthorizationProbe> };

/** Test-only public-seam adapter. The production Worker never imports this module. */
export class AuthorizationProbe extends DurableObject<ProbeEnv> {
  private watch: AuthorizationWatch | undefined;
  private readonly events: string[] = [];

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/start') {
      this.watch = new AuthorizationWatch(this.env.PEER_URL, { gameId: 'fixture-game', secret: 'a'.repeat(64) }, () =>
        this.events.push(this.watch?.status('registration-a') ?? 'suspended')
      );
      this.watch.add('registration-a', { userId: 'user-a', sessionId: 'session-a' });
    }
    if (url.pathname === '/extra') {
      this.watch?.add('registration-b', { userId: 'user-b', sessionId: 'session-b' });
    }
    if (url.pathname === '/stop') {
      await this.watch?.close();
    }
    const at = url.searchParams.get('at');
    return Response.json({
      status: this.watch?.status('registration-a', at === null ? undefined : Number(at)) ?? 'suspended',
      events: this.events,
      runtime: { hasWindow: 'window' in globalThis, userAgent: navigator.userAgent },
    });
  }
}

export default {
  fetch(request: Request, env: ProbeEnv) {
    return env.PROBE.getByName('authorization-probe').fetch(request);
  },
} satisfies ExportedHandler<ProbeEnv>;
