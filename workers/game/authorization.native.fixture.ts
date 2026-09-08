import { DurableObject } from 'cloudflare:workers';

import { AuthorizationWatch } from './authorization';

type ProbeEnv = { PEER_URL: string; PROBE: DurableObjectNamespace<AuthorizationProbe> };

/** Test-only public-seam adapter. The production Worker never imports this module. */
export class AuthorizationProbe extends DurableObject<ProbeEnv> {
  private watch: AuthorizationWatch | undefined;
  private readonly events: string[] = [];
  private latestRound = 0;

  private start() {
    this.watch = new AuthorizationWatch(this.env.PEER_URL, { gameId: 'fixture-game', secret: 'a'.repeat(64) }, () =>
      this.events.push(this.watch?.status('registration-a') ?? 'suspended')
    );
    this.latestRound = this.watch.add('registration-a', { userId: 'user-a', sessionId: 'session-a' });
  }

  private result(url: URL) {
    const at = url.searchParams.get('at');
    return Response.json({
      status:
        this.watch?.status('registration-a', {
          now: at === null ? undefined : Number(at),
          minimumRound: Number(url.searchParams.get('minimumRound') ?? 0),
        }) ?? 'suspended',
      latestRound: this.latestRound,
      events: this.events,
      runtime: { hasWindow: 'window' in globalThis, userAgent: navigator.userAgent },
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/start') {
      this.start();
    }
    if (url.pathname === '/extra') {
      this.latestRound = this.watch?.add('registration-b', { userId: 'user-b', sessionId: 'session-b' }) ?? 0;
    }
    if (url.pathname === '/stop') {
      await this.watch?.close();
    }
    return this.result(url);
  }
}

export default {
  fetch(request: Request, env: ProbeEnv) {
    return env.PROBE.getByName('authorization-probe').fetch(request);
  },
} satisfies ExportedHandler<ProbeEnv>;
