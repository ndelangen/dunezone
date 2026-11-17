import { testingPreview } from '@sb/preview';
import type { ClientMessage } from '@shared/play/protocol';

import { gameMeta, install } from './game.stories.fixture';
import { productTransport, playingSnapshot, SIX } from './product.stories.fixture';

/* A timed story, so it stays out of the visual captures, which would catch a different moment on each run. */
const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Ready Up',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/**
 * Mentat Pause waits on everyone's readiness (#2980).
 * The other players ready up one by one, every few seconds: the Ready button flashes and chimes when the table starts waiting on the viewer, and again once the viewer is the last one.
 * Hover Ready to see who is ready and who is not yet.
 * Click anywhere first, as a browser plays no sound before a click.
 */
function liveTransport() {
  const seats = SIX.map((player) => player.seat);
  const base = playingSnapshot('seat-2');
  let ready: string[] = [];
  let revision = base.revision;
  const snapshot = () => ({ ...base, phase: 8, revision, controls: { ...base.controls!, seats, ready } });
  const transport = productTransport('seat-2', snapshot(), {
    answerCommand: (message: Extract<ClientMessage, { type: 'command' }>) => {
      const { action } = message;
      if (action.kind === 'ready') {
        ready = action.ready ? [...ready, 'seat-2'] : ready.filter((seat) => seat !== 'seat-2');
        revision += 1;
      }
      return transport.view(snapshot(), message.commandId);
    },
  });
  const others = seats.filter((seat) => seat !== 'seat-2');
  const timer = setInterval(() => {
    const next = others.find((seat) => !ready.includes(seat));
    if (!next) {
      clearInterval(timer);
      return;
    }
    ready = [...ready, next];
    revision += 1;
    transport.deliver(transport.view(snapshot()));
  }, 4000);
  /* Leaving the story stops the other players readying up. */
  const dispose = transport.dispose.bind(transport);
  transport.dispose = () => {
    clearInterval(timer);
    dispose();
  };
  return transport;
}

export const Live = meta.story({
  beforeEach: install(liveTransport),
});
