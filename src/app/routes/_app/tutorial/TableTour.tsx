import { _roots } from '@react-three/fiber/webgpu';
import { useEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';
import type { Camera, Vector3Tuple } from 'three';

import styles from './TableTour.module.css';

/*
 * A guided tour over the live Play table: numbered marks pinned to parts of the table and the page, and a card that walks through them.
 * A mark on the table follows a point in the scene through the table's own camera every frame, so it stays on its part while the player tilts, zooms or pans.
 * A mark on the page follows an element's box.
 */

/** Where a stop points: a point on the table, in the scene's coordinates, or an element of the page. */
export type TourAnchor =
  | Readonly<{ kind: 'table'; point: () => Vector3Tuple | null }>
  | Readonly<{ kind: 'page'; element: () => Element | null }>;

export type TourStop = Readonly<{ id: string; title: string; body: string; anchor: TourAnchor }>;

type Placed = Readonly<{ x: number; y: number; shown: boolean }>;

const HIDDEN: Placed = { x: 0, y: 0, shown: false };
const projected = new Vector3();

/* The table's camera and canvas, read from the scene that drew it; the page shows one table at a time. */
function tableView(): { camera: Camera; canvas: HTMLCanvasElement } | null {
  for (const [canvas, root] of _roots) {
    if (canvas instanceof HTMLCanvasElement && canvas.isConnected) {
      /* The scene has no camera until its first frame. */
      const camera = root.store.getState().camera as Camera | null;
      return camera ? { camera, canvas } : null;
    }
  }
  return null;
}

function place(anchor: TourAnchor): Placed {
  if (anchor.kind === 'page') {
    /* A page part is marked on its edge nearest the table, so the mark never covers its words. */
    const box = anchor.element()?.getBoundingClientRect();
    if (!box || box.width === 0) {
      return HIDDEN;
    }
    const upper = box.top + box.height / 2 < window.innerHeight / 2;
    return { x: box.left + box.width / 2, y: upper ? box.bottom : box.top, shown: true };
  }
  const view = tableView();
  const point = anchor.point();
  if (!view || !point) {
    return HIDDEN;
  }
  const box = view.canvas.getBoundingClientRect();
  projected.set(...point).project(view.camera);
  if (projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) {
    return HIDDEN;
  }
  return {
    x: box.left + ((projected.x + 1) / 2) * box.width,
    y: box.top + ((1 - projected.y) / 2) * box.height,
    shown: true,
  };
}

/** The numbered marks and the tour card, over whatever page holds the table. */
export function TableTour({ title, stops }: Readonly<{ title: string; stops: readonly TourStop[] }>) {
  const [current, setCurrent] = useState(0);
  const marks = useRef<(HTMLDivElement | null)[]>([]);
  const card = useRef<HTMLElement>(null);

  /* Every frame, each mark moves to where its part is now drawn. */
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      stops.forEach((stop, index) => {
        const mark = marks.current[index];
        if (!mark) {
          return;
        }
        const placed = place(stop.anchor);
        mark.style.display = placed.shown ? '' : 'none';
        /* Near the top of the window the number hangs below its point instead. */
        mark.toggleAttribute('data-below', placed.y < 90);
        mark.style.transform = `translate3d(${placed.x}px, ${placed.y}px, 0)`;
      });
      /* The card rests in the table's lower left corner, clear of the header and the panel below. */
      const view = tableView();
      if (card.current && view) {
        const box = view.canvas.getBoundingClientRect();
        card.current.style.top = `${Math.max(box.top + 90, box.bottom - card.current.offsetHeight - 72)}px`;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stops]);

  const stop = stops[current]!;
  return (
    <>
      <div className={styles.layer} aria-hidden>
        {stops.map((each, index) => (
          <div
            key={each.id}
            ref={(element) => {
              marks.current[index] = element;
            }}
            className={styles.mark}
            data-tour-mark
            data-current={index === current || undefined}
          >
            <span className={styles.dot} />
            <button type="button" className={styles.number} tabIndex={-1} onClick={() => setCurrent(index)}>
              {index + 1}
            </button>
            {index === current ? <span className={styles.label}>{each.title}</span> : null}
          </div>
        ))}
      </div>
      <aside ref={card} className={styles.card} aria-label={title}>
        <p className={styles.eyebrow}>
          {title} · {current + 1} of {stops.length}
        </p>
        <p className={styles.title}>
          <span className={styles.badge}>{current + 1}</span>
          {stop.title}
        </p>
        <p className={styles.body}>{stop.body}</p>
        <div className={styles.actions}>
          <button type="button" onClick={() => setCurrent(current - 1)} disabled={current === 0}>
            Back
          </button>
          <button type="button" onClick={() => setCurrent(current + 1)} disabled={current === stops.length - 1}>
            Next
          </button>
        </div>
      </aside>
    </>
  );
}
