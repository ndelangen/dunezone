import { Group, Text } from '@mantine/core';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { arriveDirectly, endDeparture } from '@app/shell/voyage';
import { useMotionAllowed } from '@app/styles/motion';

import styles from './TableWait.module.css';

/*
 * Every wait mounts its own frame (the access answer, the table chunk, the connection, the renderer), so the moons key their
 * orbits to the document's own timeline rather than to their mount: every frame's orbits share one start, at the timeline's
 * origin, so the next frame shows them exactly where the last one left them, however long its render took to reach the screen.
 */
const now = () => (typeof performance === 'undefined' ? 0 : performance.now());
const ORBITING = /table-wait-(orbit|moon)/;
const ARRIVING = /table-wait-arrive/;

/*
 * The moons' entrance runs on the same timeline: a frame that carries on from another keeps the first frame's entrance where
 * it is, finished or still fading in, rather than restarting it or cutting it short.
 */
function keepOrbitsOnPageClock(frame: HTMLElement | null, carriesOn: boolean) {
  const timeline = document.timeline.currentTime;
  if (!carriesOn && typeof timeline === 'number') {
    frames.arrivedAt = timeline;
  }
  for (const animation of frame?.getAnimations({ subtree: true }) ?? []) {
    if (!(animation instanceof CSSAnimation)) {
      continue;
    }
    if (ORBITING.test(animation.animationName)) {
      animation.startTime = 0;
    } else if (ARRIVING.test(animation.animationName)) {
      animation.startTime = frames.arrivedAt;
    }
  }
}

/*
 * The frames the waits mount one after another read as one: a frame that follows another (still mounted, or gone within a moment)
 * carries on rather than arriving, so its moons do not fade in again and a status line it repeats does not ease in again.
 */
const CARRY_ON_MS = 1500;
const frames = { mounted: 0, leftAt: Number.NEGATIVE_INFINITY, arrivedAt: 0, status: null as string | null };
const followsAnotherFrame = () => frames.mounted > 0 || now() - frames.leftAt < CARRY_ON_MS;

/**
 * The one frame a table route shows while anything is still on its way: the access answer, the table chunk, the connection, the admission.
 * Every wait is a different line of text in the same frame, so the visitor sees one page filling in, not a sequence of pages.
 * The frame is see-through: it marks the page as on its way to a table (`data-voyage`), and the app's own planet rises from the foot of the page to the frame's centre.
 * Its two moons circle that planet here, and the table later opens out of it.
 * `connection` stamps the subscription status the browser verification waits on;
 * `children` are the controls that stay reachable while waiting (the way back to the lobby, a sign-in link).
 */
export function TableWait({
  status,
  connection,
  children,
}: Readonly<{ status: ReactNode; connection?: string; children?: ReactNode }>) {
  const motion = useMotionAllowed();
  const frame = useRef<HTMLDivElement>(null);
  const [carriesOn] = useState(followsAnotherFrame);
  const [repeated] = useState(() => carriesOn && typeof status === 'string' && status === frames.status);
  /*
   * The frame carries the voyage from here on, so the departing page's document mark can go.
   * A first frame that nothing departed into (a direct link, a reload) puts the planet in the centre at once rather than raising it.
   */
  useLayoutEffect(() => {
    const departed = document.documentElement.dataset.voyage === 'departing';
    endDeparture();
    if (!departed && !carriesOn) {
      arriveDirectly();
    }
  }, [carriesOn]);
  /* Before the frame's first paint, so its moons never show a frame away from the shared orbit. */
  useLayoutEffect(() => keepOrbitsOnPageClock(frame.current, carriesOn), [motion, carriesOn]);
  useEffect(() => {
    frames.mounted += 1;
    return () => {
      frames.mounted -= 1;
      frames.leftAt = now();
    };
  }, []);
  useEffect(() => {
    frames.status = typeof status === 'string' ? status : null;
  }, [status]);
  return (
    <DarkSchemeIsland>
      <div
        ref={frame}
        className={styles.loading}
        {...darkSchemeIslandAttributes}
        data-voyage="waiting"
        data-connection={connection}
        data-still={!motion || undefined}
        data-carries-on={carriesOn || undefined}
      >
        <div className={styles.orrery} aria-hidden>
          <div className={styles.orbit} data-orbit="near">
            <span className={styles.moon} />
          </div>
          <div className={styles.orbit} data-orbit="far">
            <span className={styles.moon} />
          </div>
        </div>
        <Text
          component="div"
          key={typeof status === 'string' ? status : 'notice'}
          role="status"
          className={typeof status === 'string' ? styles.status : styles.notice}
          data-repeated={repeated || undefined}
        >
          {status}
        </Text>
        {children && (
          <Group justify="center" gap="sm" className={styles.controls}>
            {children}
          </Group>
        )}
      </div>
    </DarkSchemeIsland>
  );
}
