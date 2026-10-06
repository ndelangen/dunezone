import { Popover } from '@mantine/core';
import { Surface } from '@ui/surface';
import clsx from 'clsx';
import { Ellipsis } from 'lucide-react';
import {
  Children,
  Fragment,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren, ReactElement, ReactNode, RefObject } from 'react';

import { IconAction } from '../control/IconAction';
import styles from './Toolbar.module.css';

type ToolbarSlotProps = PropsWithChildren<{
  /** Names the edge for assistive tech, as a group: "Navigation", "Ruleset actions". */
  label?: string;
}>;

/**
 * What a run of actions on the right edge is for.
 * The kit, not the page, decides the order they stand in, so every toolbar reads left to right the same way:
 * `about` is the page's statuses behind one `StatusInfo`, first, and it never folds.
 * `content` works on what the page shows (create, add, open, preview, fit), `access` changes who may touch it (group assignment, membership), `discard` throws work away (reset, delete), and `commit` keeps it (publish, save), last and nearest the edge.
 */
type ToolbarClusterKind = 'about' | 'content' | 'access' | 'discard' | 'commit';

const CLUSTER_ORDER: readonly ToolbarClusterKind[] = ['about', 'content', 'access', 'discard', 'commit'];

/* Which runs give way first when the band runs out of room: the rarest first, and never the commit run, which is why an editor is open at all, nor the one action that holds the page's statuses. */
const OVERFLOW_ORDER: readonly ToolbarClusterKind[] = ['discard', 'access', 'content'];

const OverflowDismissContext = createContext<(() => void) | null>(null);

/** A folded action can dismiss its menu before reporting an intent that opens another pane. */
export function useDismissToolbarOverflow() {
  return useContext(OverflowDismissContext);
}

type ToolbarClusterProps = PropsWithChildren<{ kind: ToolbarClusterKind }>;

function Left({ children }: ToolbarSlotProps) {
  return <>{children}</>;
}

function Center({ children }: ToolbarSlotProps) {
  return <>{children}</>;
}

function Right({ children }: ToolbarSlotProps) {
  return <>{children}</>;
}

function Cluster({ children }: ToolbarClusterProps) {
  return <>{children}</>;
}

/**
 * A pane of controls, divided into what leads, what labels, and what acts.
 *
 * Callers own the controls.
 * This owns the band they sit in: the pane, its gutter, the three positions, the order and spacing of the actions, and what happens when they do not fit.
 * `Left` and `Right` share the remaining width and pull to their outer edges, while `Center` takes only the room it needs.
 *
 * Every page toolbar reads the same way (Norbert, 2026-09-29).
 * `Left` is where you go: Back to the page above first, then the switch between reading and editing this thing (Edit on a detail page), and nothing else.
 * `Center` holds the controls that shape what the page lists, as one `SearchRefine`, or an editor's one live indicator, and is empty otherwise.
 * `Right` is what you can do here, handed over as `Toolbar.Cluster`s: the kit stands them in the order `ToolbarClusterKind` states with a wider gap between them, so a page cannot put delete before create.
 * One thin divider stands before the commit run alone, since keeping the work is the one step apart from the rest.
 * More lines than that read as clutter (Norbert, 2026-09-29).
 * Every action is an icon with its words in the tooltip, `size="lg"` with a 17px glyph.
 * Colour says what happens to the reader's work, and emphasis only how prominent the action is (Norbert, 2026-09-29).
 * Slate (`neutral`) changes nothing: going, looking, arranging, sharing, changing access.
 * Green (`positive`) creates or saves, violet (`publish`) makes public for good, cyan (`export`) hands over a file, and red (`negative`) loses something for good.
 * A step undone in one press is never red.
 * Every action is `standard`, except the page's one create and the commit run, which are `strong`.
 * A toggle that is on is `pressed`, never stronger.
 *
 * A toolbar shows no statuses and no facts in its row.
 * The page's statuses sit behind one info action, `StatusInfo` in the `about` cluster, which lists them all (Norbert, 2026-09-29).
 * The state of the work also shows on the action it concerns: Save wears the save state, and an action that cannot run says why in its own tooltip (`disabledReason`).
 *
 * The band never grows taller than one row of actions, at any width.
 * When the actions do not fit, whole clusters fold into a More actions menu before the commit run, the rarest first (discard, then access, then content), and they come back when the room does.
 *
 * Give an edge a `label` and it is announced as a named group, so a page never wraps its controls in a `Group` of its own.
 *
 * It is a surface, so it must not be placed inside one.
 * A page hands it controls, never chrome;
 * there is no variant of this without the pane, because a bare row of buttons is a `Group`.
 */
export type ToolbarProps = {
  className?: string;
  children?: ReactNode;
};

type ToolbarComponent = ((props: ToolbarProps) => ReactNode) & {
  Left: typeof Left;
  Center: typeof Center;
  Right: typeof Right;
  Cluster: typeof Cluster;
};

type Slot = { children: ReactNode; label?: string };

/* An edge with nothing in it is not announced: a named group that holds nothing is noise. */
function slotProps({ label, children }: Slot) {
  return label && Children.count(children) > 0 ? { role: 'group', 'aria-label': label } : {};
}

type ClusterRun = { kind: ToolbarClusterKind; children: ReactNode; size: number };

/*
 * The right edge's children as runs in reading order.
 * Anything handed over loose, outside a cluster, counts as `content`, so a single action needs no wrapper.
 * A run with nothing in it is dropped, so no gap stands beside an empty space.
 */
/* The actions in a cluster, looking through fragments, so a fragment whose conditionals all rendered nothing counts as empty. */
function countActions(node: ReactNode): number {
  return Children.toArray(node).reduce<number>((total, child) => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      return total + countActions(child.props.children);
    }
    return total + 1;
  }, 0);
}

function clusterRuns(children: ReactNode): ClusterRun[] {
  const byKind = new Map<ToolbarClusterKind, ReactNode[]>();
  Children.forEach(children, (child) => {
    if (child == null || typeof child === 'boolean') {
      return;
    }
    const isCluster = isValidElement<ToolbarClusterProps>(child) && child.type === Cluster;
    const kind = isCluster ? (child as ReactElement<ToolbarClusterProps>).props.kind : 'content';
    const content = isCluster ? (child as ReactElement<ToolbarClusterProps>).props.children : child;
    if (countActions(content) === 0) {
      return;
    }
    byKind.set(kind, [...(byKind.get(kind) ?? []), content]);
  });
  return CLUSTER_ORDER.flatMap((kind) => {
    const content = byKind.get(kind);
    return content
      ? [
          {
            kind,
            children: content.map((node, index) => <Fragment key={index}>{node}</Fragment>),
            size: content.reduce<number>((total, node) => total + countActions(node), 0),
          },
        ]
      : [];
  });
}

function Runs({ runs }: { runs: ClusterRun[] }) {
  return runs.map((run, index) => (
    <Fragment key={run.kind}>
      {index > 0 ? <span className={styles.gap} aria-hidden /> : null}
      {run.children}
    </Fragment>
  ));
}

/*
 * The folded runs, behind one action.
 * It closes on its own trigger, on Escape, and on a press anywhere outside it, where "outside" skips every portal: an action inside it may open a popover or menu of its own, which renders in a portal, and pressing into that must not unmount it.
 */
function OverflowMenu({ runs }: { runs: ClusterRun[] }) {
  const [opened, setOpened] = useState(false);
  const target = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!opened) {
      return;
    }
    const close = (event: PointerEvent) => {
      const node = event.target instanceof Element ? event.target : null;
      if (node && (node.closest('[data-portal]') || target.current?.contains(node))) {
        return;
      }
      setOpened(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [opened]);
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="md"
      closeOnClickOutside={false}
      closeOnEscape
      /* Focus moves into the folded actions on open and back to the trigger on close, so the keyboard reaches them without crossing the page. */
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <IconAction
          ref={target}
          label="More actions"
          emphasis="standard"
          intent="neutral"
          size="lg"
          icon={<Ellipsis size={17} aria-hidden />}
          onClick={() => setOpened((current) => !current)}
        />
      </Popover.Target>
      {/* A row of actions, not a dialog: it is named as a group, like the edges it came from, while the trigger keeps its expanded state. */}
      <Popover.Dropdown role="group" aria-label="More actions" className={styles.overflow}>
        <OverflowDismissContext.Provider value={() => setOpened(false)}>
          <Runs runs={runs} />
        </OverflowDismissContext.Provider>
      </Popover.Dropdown>
    </Popover>
  );
}

/*
 * How many runs are folded, in `OVERFLOW_ORDER`.
 * Measured rather than guessed from breakpoints, because what fits depends on how many actions this page has and how wide its centre is.
 * A width change or a change in the actions unfolds everything, and the layout effect folds again, one run per pass, until the row fits; all of it happens before paint, so the reader never sees a second row.
 */
function useFolding(root: RefObject<HTMLDivElement | null>, foldable: number, contentKey: string) {
  const [fold, setFold] = useState({ key: contentKey, width: 0, count: 0 });
  /* Reset during render when the actions change, the search box's pattern. */
  if (fold.key !== contentKey) {
    setFold({ key: contentKey, width: fold.width, count: 0 });
  }
  const count = fold.key === contentKey ? fold.count : 0;
  useLayoutEffect(() => {
    const node = root.current;
    /* The centre shrinks without limit, so a crowded row can also show as the centre's content spilling out of it over its neighbours. */
    const center = node?.querySelector<HTMLElement>(`:scope > .${styles.center}`);
    const overflowing =
      node != null &&
      (node.scrollWidth > node.clientWidth + 1 || (center != null && center.scrollWidth > center.clientWidth + 1));
    if (node && count < foldable && overflowing) {
      setFold((current) => ({ ...current, count: current.count + 1 }));
    }
  }, [root, count, foldable, contentKey, fold.width]);
  useEffect(() => {
    const node = root.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }
    let frame = 0;
    /* The width the current fold was measured at; the observer's first report is that same width and must not unfold anything. */
    let measured = node.clientWidth;
    /* Next frame, not inside the callback: refolding changes layout, which inside the observer's own delivery is a resize loop. */
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      if (node.clientWidth === measured) {
        return;
      }
      measured = node.clientWidth;
      frame = requestAnimationFrame(() => setFold((current) => ({ ...current, width: measured, count: 0 })));
    });
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [root]);
  return Math.min(count, foldable);
}

const ToolbarBase = ({ className, children }: ToolbarProps) => {
  let left: Slot = { children: null };
  let center: Slot = { children: null };
  let right: Slot = { children: null };

  Children.forEach(children, (child) => {
    if (!isValidElement<ToolbarSlotProps>(child)) {
      return;
    }

    const slot = { children: child.props.children, label: child.props.label };

    if (child.type === Left) {
      left = slot;
      return;
    }

    if (child.type === Center) {
      center = slot;
      return;
    }

    if (child.type === Right) {
      right = slot;
    }
  });

  const runs = clusterRuns(right.children);
  const foldOrder = OVERFLOW_ORDER.filter((kind) => runs.some((run) => run.kind === kind));
  const root = useRef<HTMLDivElement>(null);
  const folded = useFolding(root, foldOrder.length, runs.map((run) => `${run.kind}:${run.size}`).join(' '));
  const foldedKinds = new Set(foldOrder.slice(0, folded));
  const shown = runs.filter((run) => !foldedKinds.has(run.kind));
  const hidden = runs.filter((run) => foldedKinds.has(run.kind));
  /* The menu stands where the folded runs stood: before the commit run, or last when there is none. */
  const commit = shown.at(-1)?.kind === 'commit' ? shown.at(-1) : undefined;
  const before = commit ? shown.slice(0, -1) : shown;

  return (
    <Surface padding="sm">
      <div ref={root} className={clsx(styles.root, className)}>
        <div className={styles.left} {...slotProps(left)}>
          {left.children}
        </div>
        <div className={styles.center} {...slotProps(center)}>
          {center.children}
        </div>
        <div
          className={styles.right}
          {...slotProps({ label: right.label, children: runs.length > 0 ? right.children : null })}
        >
          <Runs runs={before} />
          {hidden.length > 0 ? (
            <>
              {before.length > 0 ? <span className={styles.gap} aria-hidden /> : null}
              <OverflowMenu runs={hidden} />
            </>
          ) : null}
          {commit ? (
            <>
              {before.length > 0 || hidden.length > 0 ? <span className={styles.divider} aria-hidden /> : null}
              {commit.children}
            </>
          ) : null}
        </div>
      </div>
    </Surface>
  );
};

export const Toolbar = Object.assign(ToolbarBase, {
  Left,
  Center,
  Right,
  Cluster,
}) as ToolbarComponent;
