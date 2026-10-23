import { Button, Group, Text } from '@mantine/core';
import { _roots } from '@react-three/fiber/webgpu';
import { Check, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Vector3 } from 'three';
import type { Camera, Vector3Tuple } from 'three';

import styles from './TutorialGuide.module.css';

/*
 * A tutorial chapter over the live Play table: a band above the table says the one thing to do now, one pointer shows where,
 * and the chapter moves on only once the player has done it. There is no Next button; the table itself is the answer.
 * The pointer follows a point on the table through the table's own camera every frame, or an element of the page.
 */

/** Where a task points: a point on the table, in the scene's coordinates, or an element of the page. */
export type GuideAnchor =
  | Readonly<{ kind: 'table'; point: () => Vector3Tuple | null }>
  | Readonly<{ kind: 'page'; element: () => Element | null }>;

/** What the table looks like to a task as it checks whether the player has done it. */
export type GuideView = Readonly<{ camera: Camera | null }>;

export type GuideTask<Baseline = unknown> = Readonly<{
  id: string;
  /** The one thing to do, as an instruction. */
  task: string;
  /** Where to find it and what it is, in one line. */
  detail: string;
  anchor: GuideAnchor;
  /** What the task remembers as it starts, to compare against. */
  begin: (view: GuideView) => Baseline;
  /** Whether the player has done it yet; asked every frame. */
  done: (baseline: Baseline, view: GuideView) => boolean;
}>;

/* How long the tick shows on a finished task before the next one starts. */
const DONE_PAUSE_MS = 900;
/* How many frames the camera holds still before a task takes its baseline. */
const SETTLE_FRAMES = 20;
/* The band's height, which the page frame below it makes room for. */
const BAND_HEIGHT = '4.5rem';

const projected = new Vector3();

/* The table's camera and canvas, read from the scene that drew it; the scene has no camera until its first frame. */
function tableView(): { camera: Camera; canvas: HTMLCanvasElement } | null {
  for (const [canvas, root] of _roots) {
    const camera = root.store.getState().camera as Camera | null;
    if (canvas instanceof HTMLCanvasElement && canvas.isConnected && camera) {
      return { camera, canvas };
    }
  }
  return null;
}

function place(anchor: GuideAnchor): { x: number; y: number } | null {
  if (anchor.kind === 'page') {
    const box = anchor.element()?.getBoundingClientRect();
    return box && box.width > 0 ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
  }
  const view = tableView();
  const point = anchor.point();
  if (!view || !point) {
    return null;
  }
  const box = view.canvas.getBoundingClientRect();
  projected.set(...point).project(view.camera);
  if (projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) {
    return null;
  }
  return { x: box.left + ((projected.x + 1) / 2) * box.width, y: box.top + ((1 - projected.y) / 2) * box.height };
}

/* The arrow stops short of its point by this much, so its tip, not its middle, lands on the part. */
const ARROW_TIP_GAP = 16;

/* Draws the arrow from the band to a spot on the page, or hides it. */
type Spot = { x: number; y: number };

function aim(group: SVGGElement | null, from: Spot, spot: Spot | null) {
  if (!group) {
    return;
  }
  group.style.display = spot ? '' : 'none';
  if (!spot) {
    return;
  }
  const length = Math.hypot(spot.x - from.x, spot.y - from.y);
  const share = length > ARROW_TIP_GAP ? (length - ARROW_TIP_GAP) / length : 0;
  const end = {
    x: from.x + (spot.x - from.x) * share,
    y: from.y + (spot.y - from.y) * share,
  };
  for (const line of group.querySelectorAll('line')) {
    line.setAttribute('x1', `${from.x}`);
    line.setAttribute('y1', `${from.y}`);
    line.setAttribute('x2', `${end.x}`);
    line.setAttribute('y2', `${end.y}`);
  }
  const ring = group.querySelector('circle')!;
  ring.setAttribute('cx', `${spot.x}`);
  ring.setAttribute('cy', `${spot.y}`);
}

/**
 * The guide for one chapter, beside whatever page holds the table.
 * Callers own the tasks and what Reset puts back;
 * this owns the order, the checking, the band and the pointer.
 */
export function TutorialGuide({
  number,
  title,
  tasks,
  onReset,
  chaptersLink,
  children,
}: Readonly<{
  number: number;
  title: string;
  tasks: readonly GuideTask[];
  onReset: () => void;
  /** Renders the way back to the chapter list, as a router link on the page and a plain one in a story. */
  chaptersLink: (props: object) => ReactNode;
  children: ReactNode;
}>) {
  const [current, setCurrent] = useState(0);
  const [run, setRun] = useState(0);
  /* Which task, in which run, the player has just done; its tick shows until the next task starts. */
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const arrow = useRef<SVGGElement>(null);
  const step = useRef<HTMLSpanElement>(null);
  const task = tasks[current];
  const finished = doneKey === `${run}:${current}`;

  /* Every frame the pointer moves to its part, and the task is asked whether it is done. */
  useEffect(() => {
    if (!task) {
      return;
    }
    let frame = 0;
    let baseline: unknown;
    let started = false;
    let doneAt: number | null = null;
    /* The camera may still be gliding into its view, so a task starts counting from where it comes to rest. */
    let still = 0;
    const resting = new Vector3();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const view = { camera: tableView()?.camera ?? null };
      /* The arrow leaves the band under the task's number, so it reads as coming from the instruction. */
      const badge = step.current?.getBoundingClientRect();
      const from = badge ? { x: badge.left + badge.width / 2, y: badge.bottom + 2 } : { x: 0, y: 0 };
      aim(arrow.current, from, doneAt === null && badge ? place(task.anchor) : null);
      if (!started) {
        if (!view.camera) {
          return;
        }
        still = view.camera.position.distanceToSquared(resting) < 1e-8 ? still + 1 : 0;
        resting.copy(view.camera.position);
        if (still < SETTLE_FRAMES) {
          return;
        }
        baseline = task.begin(view);
        started = true;
      }
      if (doneAt === null && task.done(baseline as never, view)) {
        doneAt = performance.now();
        setDoneKey(`${run}:${current}`);
      }
      if (doneAt !== null && performance.now() - doneAt > DONE_PAUSE_MS) {
        cancelAnimationFrame(frame);
        setCurrent((index) => index + 1);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [task, run, current]);

  const reset = () => {
    onReset();
    setCurrent(0);
    setRun((count) => count + 1);
  };

  return (
    <div className={styles.frame} style={{ '--page-layout-fullscreen-top': BAND_HEIGHT } as CSSProperties}>
      <header className={styles.band} aria-label={`Chapter ${number}: ${title}`}>
        <div className={styles.chapter}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            Chapter {number}
          </Text>
          <Text fw={700}>{title}</Text>
        </div>
        <div className={styles.task} aria-live="polite">
          {task ? (
            <>
              <span ref={step} className={styles.step} data-done={finished || undefined}>
                {finished ? <Check size={16} aria-hidden /> : current + 1}
              </span>
              <div>
                <Text fw={700}>{task.task}</Text>
                <Text size="sm" c="dimmed">
                  {task.detail}
                </Text>
              </div>
            </>
          ) : (
            <>
              <span className={styles.step} data-done>
                <Check size={16} aria-hidden />
              </span>
              <div>
                <Text fw={700}>Chapter done</Text>
                <Text size="sm" c="dimmed">
                  You know your way around the table. Pick the next chapter, or reset to try again.
                </Text>
              </div>
            </>
          )}
        </div>
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" c="dimmed" className={styles.count}>
            {Math.min(current + 1, tasks.length)} of {tasks.length}
          </Text>
          <Button variant="default" size="xs" leftSection={<RotateCcw size={14} aria-hidden />} onClick={reset}>
            Reset
          </Button>
          <Button variant="default" size="xs" renderRoot={chaptersLink}>
            Back to chapters
          </Button>
        </Group>
      </header>
      <svg className={styles.arrows} aria-hidden>
        <defs>
          <marker
            id="tutorial-arrowhead"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M0 0 L10 5 L0 10 z" className={styles.head} />
          </marker>
        </defs>
        <g ref={arrow} data-tutorial-pointer style={{ display: 'none' }}>
          <line className={styles.casing} />
          <line className={styles.shaft} markerEnd="url(#tutorial-arrowhead)" />
          <circle className={styles.ring} r="18" />
        </g>
      </svg>
      {children}
    </div>
  );
}
