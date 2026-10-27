import { Button, Group, Text, VisuallyHidden } from '@mantine/core';
import { Eyebrow } from '@ui/content/Eyebrow';
import { KeyedText } from '@ui/content/Kbd';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import { RotateCcw } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { Camera, Vector3Tuple } from 'three';

import { useMotionAllowed } from '@app/styles/motion';

import { ChapterComplete } from './ChapterComplete';
import { guideShapePath, keepInView, transposed } from './guideArrow';
import type { Target } from './guideArrow';
import { ReadAloud } from './ReadAloud';
import type { Box, TableLens } from './tableLens';
import styles from './TutorialGuide.module.css';

/*
 * A tutorial chapter beside the live Play table: a rail down the left lists the chapter's tasks and opens the one to do now,
 * an arrow grown from the rail shows where,
 * and the chapter moves on only once the player has done it. There is no Next button: the table itself is the answer,
 * and a task that only shows a part of the screen moves on when the player presses Enter.
 * The pointer follows a point on the table through the table's own camera every frame, or an element of the page.
 */

/** Where a task points: a point on the table, in the scene's coordinates, or an element of the page. */
type GuideAnchor =
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
/* The part of the window the guide leaves to the page, where what is out of view is pointed toward from its edge. */
function place(anchor: GuideAnchor, shown: Box, table: TableLens | null): Target | null {
  if (anchor.kind === 'page') {
    return onScreen(anchor.element(), shown);
  }
  const point = anchor.point();
  return table && point ? table.project(point, shown) : null;
}

/* The window right of the rail. */
const windowBox = (rail: DOMRect | undefined): Box => ({
  left: rail?.right ?? 0,
  top: 0,
  right: window.innerWidth,
  bottom: window.innerHeight,
});

function onScreen(element: Element | null, shown: Box): Target | null {
  const box = element?.getBoundingClientRect();
  if (!box || box.width <= 0) {
    return null;
  }
  return keepInView(
    {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
      halfWidth: box.width / 2,
      halfHeight: box.height / 2,
    },
    shown
  );
}

/*
 * Redraws the rail's outline, with its arrow toward a spot when there is one.
 * The arrow leaves the rail partway between the task's number and the spot, so it reads as coming from the instruction.
 * The outline is worked out as if the rail lay along the top of the window, then turned onto its side: mirrored across the diagonal.
 */
function aim(paths: readonly (SVGPathElement | null)[], badge: DOMRect, rail: DOMRect, spot: Target | null) {
  const flip = (box: DOMRect) => new DOMRect(box.y, box.x, box.height, box.width);
  const along = spot && {
    x: spot.y,
    y: spot.x,
    halfWidth: spot.halfHeight,
    halfHeight: spot.halfWidth,
  };
  const edges = flip(rail);
  const mark = flip(badge);
  const margin = 60;
  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
  const midway = (mark.left + mark.width / 2 + (along?.x ?? 0)) / 2;
  /* It runs out at least as steeply as it runs along the rail, so a target close beside the rail is not pointed at along its edge. */
  const drop = Math.max(0, (along?.y ?? 0) - edges.bottom);
  const steep = along ? clamp(midway, along.x - drop, along.x + drop) : midway;
  const root = {
    x: clamp(steep, edges.left + margin, edges.right - margin),
    y: edges.bottom,
  };
  const outline = transposed(guideShapePath(edges, root, along));
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

/* How wide the rail is, set in the stylesheet so the page beside a lobby chapter can make room for it as well. */
const RAIL_WIDTH = 'var(--tutorial-rail-width)';

/**
 * The guide for one chapter, beside whatever page holds the table.
 * Callers own the tasks and what Reset puts back;
 * this owns the order, the checking, the rail and its arrow.
 */
export function TutorialGuide({
  number,
  title,
  tasks,
  firstTask = 0,
  learned,
  onReset,
  chaptersLink,
  nextLink,
  table = null,
  children,
}: Readonly<{
  /** The chapter's place in the tutorial. */
  number: number;
  title: string;
  tasks: readonly GuideTask[];
  /** The task the guide opens at, counted from 0; Reset still starts from the first. */
  firstTask?: number;
  /** What the chapter taught, listed when it ends. */
  learned: readonly string[];
  onReset: () => void;
  /** Renders the way back to the chapter list, as a router link on the page and a plain one in a story. */
  chaptersLink: (props: object) => ReactNode;
  /** Renders the way on to the next chapter, when that one is built. */
  nextLink?: ((props: object) => ReactNode) | undefined;
  /** How the guide sees the page's table, whose camera the first task waits for; a chapter on the lobby pages has none. */
  table?: TableLens | null;
  children: ReactNode;
}>) {
  const [current, setCurrent] = useState(() => Math.min(firstTask, tasks.length - 1));
  const [run, setRun] = useState(0);
  /* The run whose end the player closed to keep playing at its table; the card, its veil and the confetti go with it. */
  const [keptPlaying, setKeptPlaying] = useState<number | null>(null);
  /* Which task, in which run, the player has just done; its tick shows until the next task starts. */
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const fill = useRef<SVGPathElement>(null);
  const edge = useRef<SVGPathElement>(null);
  const rail = useRef<HTMLElement>(null);
  const step = useRef<HTMLSpanElement>(null);
  const task = tasks[current];
  const motion = useMotionAllowed();
  const kicker = `Chapter ${number}`;
  /* The loop below follows the task by its id, so a caller that builds its task list afresh on each render does not restart it. */
  const taskId = task?.id;
  const currentTask = useEffectEvent(() => tasks[current]);
  const inset = `${useId()}-inset`;
  const finished = doneKey === `${run}:${current}`;
  /* Which run has its table in place; until then the rail says it is setting up, so nothing the player does is lost. */
  const [readyRun, setReadyRun] = useState<number | null>(null);
  const waiting = readyRun !== run;

  /* Every frame the pointer moves to its part, and the task is asked whether it is done. */
  useEffect(() => {
    let frame = 0;
    const task = currentTask();
    const draw = (spot: Target | null) => {
      const badge = step.current?.getBoundingClientRect();
      const box = rail.current?.getBoundingClientRect();
      /* With no number showing, as once the chapter is done, the arrow-less outline still needs a box to draw from. */
      if (box) {
        aim([fill.current, edge.current], badge ?? box, box, spot);
      }
    };
    /* Once the chapter is done the rail stays, without its arrow. */
    if (!task) {
      const still = () => {
        frame = requestAnimationFrame(still);
        draw(null);
      };
      frame = requestAnimationFrame(still);
      return () => cancelAnimationFrame(frame);
    }
    let baseline: unknown;
    let started = false;
    let doneAt: number | null = null;
    /*
     * As a run opens the camera may still be gliding into its view, so its first task starts counting from where it comes to rest,
     * and the rail shows the task only then. Later tasks start at once, so a move the player makes straight away counts.
     */
    const settled = current === 0 && table ? table.settling() : () => true;
    const start = (view: GuideView) => {
      if (table && (!view.camera || !settled(view.camera))) {
        return false;
      }
      baseline = task.begin(view);
      setReadyRun(run);
      return true;
    };
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const view = { camera: table?.camera() ?? null };
      const spot =
        started && doneAt === null ? place(task.anchor, windowBox(rail.current?.getBoundingClientRect()), table) : null;
      draw(spot);
      /* With nothing on screen to point at, only a key can be the way in, so the keys in the task call for attention instead. */
      rail.current?.toggleAttribute('data-keys-only', started && doneAt === null && spot === null);
      if (!started) {
        started = start(view);
      }
      if (!started) {
        return;
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
  }, [taskId, run, current, table]);

  /*
   * Reset lets go of the focus a click gave it: a control beside the table keeps Space to press itself, so Space would
   * reset the chapter again instead of opening the compass the first task asks for. A key press (detail 0) keeps its focus.
   */
  const reset = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) {
      event.currentTarget.blur();
    }
    onReset();
    setCurrent(0);
    setRun((count) => count + 1);
  };

  /*
   * A task in the rail, with its number on the arrow's side of the list. The one at hand is large and opens to say where;
   * done and coming tasks are one small line each, and the coming ones blur the further off they are, so the eye lands on the task at hand.
   * Each part is always there and only its look changes with the task's state, so a task can grow, shrink and tick over smoothly.
   */
  const railTask = (index: number) => {
    const item = tasks[index]!;
    const done = index < current || (index === current && finished);
    const open = index === current && !waiting;
    return (
      <>
        <span ref={index === current ? step : undefined} className={styles.step}>
          <span className={styles.number}>{index + 1}</span>
          <svg className={styles.tick} viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12.5 9.5 17 19 7" pathLength={1} />
          </svg>
        </span>
        <div className={styles.railText}>
          <p className={styles.railTitle}>
            {index === current && waiting ? 'Setting the table…' : <KeyedText>{item.task}</KeyedText>}
            {done && <VisuallyHidden> (done)</VisuallyHidden>}
          </p>
          <div className={styles.railMore} aria-hidden={!open}>
            <div className={styles.railBody}>
              <p className={styles.railDetail}>
                <KeyedText>{item.detail}</KeyedText>
              </p>
              {/* Keyed by the task and the run, so the voice stops as the task changes or the chapter resets. */}
              {open && <ReadAloud key={`${run}:${item.id}`} text={`${item.task}. ${item.detail}`} />}
            </div>
          </div>
        </div>
      </>
    );
  };
  const chapterDone = (
    <div className={styles.railText}>
      <p className={styles.railTitle}>Chapter done</p>
      <p className={styles.railEnd}>Pick the next chapter, or reset to try again.</p>
    </div>
  );
  const frameStyle = {
    '--page-layout-fullscreen-left': RAIL_WIDTH,
    '--rail-width': RAIL_WIDTH,
  };

  return (
    <div className={styles.frame} style={frameStyle as CSSProperties}>
      <DarkSchemeIsland>
        <div className={styles.guide} {...darkSchemeIslandAttributes} data-motion={motion ? undefined : 'reduce'}>
          <svg className={styles.shape} aria-hidden>
            <defs>
              {/* A shadow cast inward from every edge of the outline, so the rail's depth follows it into the arrow. */}
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
          <header ref={rail} className={styles.rail} data-tutorial-free aria-label={`${kicker}: ${title}`}>
            <div className={styles.railHead}>
              <Eyebrow>{`${kicker} · ${Math.min(current + 1, tasks.length)} of ${tasks.length}`}</Eyebrow>
              <Text fz="xl" fw={700}>
                {title}
              </Text>
              <div
                className={styles.progress}
                style={
                  {
                    '--progress': (current + (finished ? 1 : 0)) / tasks.length,
                  } as CSSProperties
                }
              />
            </div>
            <ol className={styles.railSteps} aria-live="polite">
              {tasks.map((item, index) => (
                <li
                  key={item.id}
                  className={styles.railStep}
                  data-state={index < current ? 'done' : index === current ? 'current' : 'next'}
                  data-ticked={index < current || (index === current && finished) || undefined}
                  style={{ '--ahead': Math.max(0, index - current) } as CSSProperties}
                >
                  {railTask(index)}
                </li>
              ))}
              {!task && (
                <li className={styles.railStep} data-state="current">
                  {chapterDone}
                </li>
              )}
            </ol>
            <Group gap="xs" wrap="nowrap" className={styles.railFoot}>
              <Button variant="default" size="sm" leftSection={<RotateCcw size={14} aria-hidden />} onClick={reset}>
                Reset
              </Button>
              <Button variant="default" size="sm" renderRoot={chaptersLink}>
                Back to chapters
              </Button>
            </Group>
          </header>
        </div>
      </DarkSchemeIsland>
      {/* Under the end of a chapter the table holds still: nothing in it takes focus, clicks or keys. */}
      <div className={styles.table} data-tutorial-pages={table ? undefined : ''} inert={!task && keptPlaying !== run}>
        {children}
      </div>
      {!task && keptPlaying !== run && (
        <ChapterComplete
          key={run}
          learned={learned}
          chaptersLink={chaptersLink}
          nextLink={nextLink}
          onKeepPlaying={() => setKeptPlaying(run)}
        />
      )}
    </div>
  );
}
