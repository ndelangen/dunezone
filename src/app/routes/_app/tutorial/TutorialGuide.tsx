import { Button, Group, Text } from '@mantine/core';
import { _roots } from '@react-three/fiber/webgpu';
import { Check, RotateCcw } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Vector3 } from 'three';
import type { Camera, Vector3Tuple } from 'three';

import { guideShapePath } from './guideArrow';
import type { Target } from './guideArrow';
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
  /** Lets go of anything `begin` set up, as the task ends. */
  finish?: (baseline: Baseline) => void;
}>;

/* How long the tick shows on a finished task before the next one starts. */
const DONE_PAUSE_MS = 900;
/* How many frames the camera holds still before a run's first task takes its baseline. */
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

function place(anchor: GuideAnchor): Target | null {
  if (anchor.kind === 'page') {
    const box = anchor.element()?.getBoundingClientRect();
    return box && box.width > 0
      ? {
          x: box.left + box.width / 2,
          y: box.top + box.height / 2,
          halfWidth: box.width / 2,
          halfHeight: box.height / 2,
        }
      : null;
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
  return {
    x: box.left + ((projected.x + 1) / 2) * box.width,
    y: box.top + ((1 - projected.y) / 2) * box.height,
    halfWidth: 0,
    halfHeight: 0,
  };
}

/*
 * Redraws the band's outline, with its arrow toward a spot when there is one.
 * The arrow leaves the band partway between the task's number and the spot, so it reads as coming from the instruction.
 */
function aim(paths: readonly (SVGPathElement | null)[], badge: DOMRect, band: DOMRect, spot: Target | null) {
  const margin = 60;
  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
  const midway = (badge.left + badge.width / 2 + (spot?.x ?? 0)) / 2;
  /* It drops at least as steeply as it runs sideways, so a target close under the band is not pointed at along the band's edge. */
  const drop = Math.max(0, (spot?.y ?? 0) - band.bottom);
  const steep = spot ? clamp(midway, spot.x - drop, spot.x + drop) : midway;
  const root = { x: clamp(steep, band.left + margin, band.right - margin), y: band.bottom };
  const outline = guideShapePath(band, root, spot);
  /* The shape casts blurred shadows, so it is redrawn only when it changes, not every frame. */
  if (paths[0]?.getAttribute('d') === outline) {
    return;
  }
  for (const path of paths) {
    path?.setAttribute('d', outline);
  }
  /* Where the arrow points, for a test to find the part it shows. */
  paths[0]?.setAttribute('data-target', spot ? `${Math.round(spot.x)} ${Math.round(spot.y)}` : '');
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
  const fill = useRef<SVGPathElement>(null);
  const edge = useRef<SVGPathElement>(null);
  const band = useRef<HTMLElement>(null);
  const step = useRef<HTMLSpanElement>(null);
  const task = tasks[current];
  /* The loop below follows the task by its id, so a caller that builds its task list afresh on each render does not restart it. */
  const taskId = task?.id;
  const currentTask = useEffectEvent(() => tasks[current]);
  const inset = `${useId()}-inset`;
  const finished = doneKey === `${run}:${current}`;
  /* Which run has its table in place; until then the band says it is setting up, so nothing the player does is lost. */
  const [readyRun, setReadyRun] = useState<number | null>(null);
  const waiting = readyRun !== run;

  /* Every frame the pointer moves to its part, and the task is asked whether it is done. */
  useEffect(() => {
    let frame = 0;
    const task = currentTask();
    /* Once the chapter is done the band stays, without its arrow. */
    if (!task) {
      const still = () => {
        frame = requestAnimationFrame(still);
        const badge = step.current?.getBoundingClientRect();
        const box = band.current?.getBoundingClientRect();
        if (badge && box) {
          aim([fill.current, edge.current], badge, box, null);
        }
      };
      frame = requestAnimationFrame(still);
      return () => cancelAnimationFrame(frame);
    }
    let baseline: unknown;
    let started = false;
    let doneAt: number | null = null;
    /*
     * As a run opens the camera may still be gliding into its view, so its first task starts counting from where it comes to rest,
     * and the band shows the task only then. Later tasks start at once, so a move the player makes straight away counts.
     */
    let still = current === 0 ? 0 : SETTLE_FRAMES;
    const resting = new Vector3();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const view = { camera: tableView()?.camera ?? null };
      const badge = step.current?.getBoundingClientRect();
      const box = band.current?.getBoundingClientRect();
      if (badge && box) {
        aim([fill.current, edge.current], badge, box, started && doneAt === null ? place(task.anchor) : null);
      }
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
        setReadyRun(run);
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
    return () => {
      cancelAnimationFrame(frame);
      if (started) {
        task.finish?.(baseline as never);
      }
    };
  }, [taskId, run, current]);

  const reset = () => {
    onReset();
    setCurrent(0);
    setRun((count) => count + 1);
  };

  return (
    <div className={styles.frame} style={{ '--page-layout-fullscreen-top': BAND_HEIGHT } as CSSProperties}>
      <div className={styles.guide}>
        <svg className={styles.shape} aria-hidden>
          <defs>
            {/* A shadow cast inward from every edge of the outline, so the band's depth follows it into the arrow. */}
            <filter id={inset} x="-5%" y="-5%" width="110%" height="110%">
              <feComponentTransfer in="SourceAlpha" result="outside">
                <feFuncA type="table" tableValues="1 0" />
              </feComponentTransfer>
              <feGaussianBlur in="outside" stdDeviation="7" />
              <feOffset dy="2" result="spread" />
              <feFlood floodColor="#000" floodOpacity="0.75" />
              <feComposite in2="spread" operator="in" />
              <feComposite in2="SourceAlpha" operator="in" result="inset" />
              <feMerge>
                <feMergeNode in="SourceGraphic" />
                <feMergeNode in="inset" />
              </feMerge>
            </filter>
          </defs>
          <path ref={fill} className={styles.fill} data-tutorial-pointer filter={`url(#${inset})`} />
          <path ref={edge} className={styles.edge} />
        </svg>
        <header ref={band} className={styles.band} aria-label={`Chapter ${number}: ${title}`}>
          <div className={styles.chapter}>
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              Chapter {number}
            </Text>
            <Text fw={700}>{title}</Text>
          </div>
          <div className={styles.task} aria-live="polite">
            {task && waiting ? (
              <>
                <span ref={step} className={styles.step}>
                  {current + 1}
                </span>
                <Text fw={700}>Setting the table…</Text>
              </>
            ) : task ? (
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
                <span ref={step} className={styles.step} data-done>
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
      </div>
      {children}
    </div>
  );
}
