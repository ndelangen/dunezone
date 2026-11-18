import { snapshotFactionLabels } from '@shared/play/factionLabels';
import type { Decorator } from '@storybook/tanstack-react';
import { useEffect, useState } from 'react';

import { snapshotFactionToken } from './multiplayer/FactionTokenFace';
import { SoftNotices } from './multiplayer/SoftNotices';
import type { SoftNotice, SoftNoticeKind, SoftNoticeVariant } from './multiplayer/SoftNotices';
import { playingSnapshot } from './product.stories.fixture';

/** The seat the soft notification stories watch from. */
export const NOTICE_VIEWER = 'seat-2';

type Scripted = Readonly<{ after: number; kind: SoftNoticeKind; from: 'own' | number; text: (name: string) => string }>;

/*
 * What happens to the viewer over a minute of play, as the playtesters asked to be told (#2981):
 * their turn comes up, they get paid, pinged, offered an alliance and mentioned. `from` is the viewer or another seat by its index.
 */
const SCRIPT: readonly Scripted[] = [
  { after: 600, kind: 'bid', from: 'own', text: () => 'Your turn to bid' },
  { after: 3200, kind: 'spice', from: 2, text: (name) => `${name} paid you 3 spice` },
  { after: 5600, kind: 'ping', from: 0, text: (name) => `${name} pinged you` },
  { after: 8200, kind: 'alliance', from: 3, text: (name) => `${name} offers you an alliance` },
  { after: 10_800, kind: 'mention', from: 4, text: (name) => `${name} mentioned you in table chat` },
  { after: 13_400, kind: 'ship', from: 'own', text: () => 'Your turn to ship and move' },
  { after: 17_000, kind: 'battle', from: 'own', text: () => 'Your battle in Arrakeen is up' },
];

/** The script loops, so a story left open keeps showing notices arrive. */
const LOOP_MS = 24_000;

function scriptedNotices(): readonly (Omit<SoftNotice, 'at' | 'id'> & { after: number })[] {
  const snapshot = playingSnapshot(NOTICE_VIEWER);
  const names = snapshotFactionLabels(snapshot);
  const seats = snapshot.roster!.seats.flatMap(({ faction, id }) => (faction ? [{ id: faction.id, seat: id }] : []));
  const own = seats.find((entry) => entry.seat === NOTICE_VIEWER)!.id;
  const others = seats.filter((entry) => entry.id !== own).map((entry) => entry.id);
  return SCRIPT.map(({ after, kind, from, text }) => {
    const factionId = from === 'own' ? own : others[from % others.length]!;
    const token = snapshotFactionToken(snapshot, factionId, names);
    return { after, kind, from: token, text: text(token.name) };
  });
}

/** The scripted notices that have arrived so far, each stamped with when it did. */
function useScriptedNotices() {
  const [notices, setNotices] = useState<readonly SoftNotice[]>([]);
  useEffect(() => {
    const script = scriptedNotices();
    const timers: number[] = [];
    let round = 0;
    const play = () => {
      const current = round++;
      for (const entry of script) {
        timers.push(
          window.setTimeout(() => {
            setNotices((before) =>
              [...before, { ...entry, id: `${current}-${entry.kind}`, at: performance.now() }].slice(-12)
            );
          }, entry.after)
        );
      }
      timers.push(window.setTimeout(play, LOOP_MS));
    };
    /* The script starts a moment after the table is on screen, so its first notices do not pass, or bunch up, while the table loads. */
    const waiting = window.setInterval(() => {
      if (document.querySelector('.seated-header')) {
        window.clearInterval(waiting);
        timers.push(window.setTimeout(play, 1500));
      }
    }, 250);
    return () => {
      window.clearInterval(waiting);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);
  return notices;
}

function ScriptedNotices({ variant }: Readonly<{ variant: SoftNoticeVariant }>) {
  return <SoftNotices variant={variant} notices={useScriptedNotices()} />;
}

/** Lays the soft notices over the live table, playing the script. */
export function withSoftNotices(variant: SoftNoticeVariant): Decorator {
  return (Story) => (
    <>
      <Story />
      <ScriptedNotices variant={variant} />
    </>
  );
}
