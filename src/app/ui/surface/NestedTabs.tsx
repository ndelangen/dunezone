import { Tooltip } from '@mantine/core';
import type { Link, LinkComponentProps, RegisteredRouter } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  Children,
  createContext,
  createElement,
  isValidElement,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {
  ComponentPropsWithoutRef,
  Context,
  Dispatch,
  ElementType,
  PropsWithChildren,
  ReactElement,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react';

import styles from './NestedTabs.module.css';
import { PaintedSurfaceBoundary } from './Surface';

export type NestedTabsPath = readonly string[];

interface NestedTabsContextValue {
  activePath: NestedTabsPath;
  isScrolling: boolean;
  levelIndex: number;
}

const NESTED_TABS_CONTEXT_KEY = Symbol.for('dunezone.nested-tabs-context');

type NestedTabsGlobal = typeof globalThis & {
  [NESTED_TABS_CONTEXT_KEY]?: Context<NestedTabsContextValue | null>;
};

const nestedTabsGlobal = globalThis as NestedTabsGlobal;
const NestedTabsContext =
  nestedTabsGlobal[NESTED_TABS_CONTEXT_KEY] ?? createContext<NestedTabsContextValue | null>(null);
nestedTabsGlobal[NESTED_TABS_CONTEXT_KEY] = NestedTabsContext;

const NESTED_TABS_CHILD_KIND = Symbol.for('dunezone.nested-tabs-child-kind');

type NestedTabsChildKind = 'item' | 'group' | 'tools' | 'level' | 'content-panel';

type NestedTabsChildComponent = {
  [NESTED_TABS_CHILD_KIND]?: NestedTabsChildKind;
};

function markNestedTabsChild(component: object, kind: NestedTabsChildKind) {
  Object.defineProperty(component, NESTED_TABS_CHILD_KIND, { value: kind });
}

function nestedTabsChildKind(child: ReactElement): NestedTabsChildKind | null {
  if (Object(child.type) !== child.type) {
    return null;
  }
  return (child.type as NestedTabsChildComponent)[NESTED_TABS_CHILD_KIND] ?? null;
}

interface NestedTabsLayerGeometry {
  width: number;
  height: number;
  path: string;
}

function buildNestedTabsLayerPath({
  height,
  startX,
  endX,
  tabLeft,
  tabTop,
  tabBottom,
  radius,
  roundEndCorners,
}: {
  height: number;
  startX: number;
  endX: number;
  tabLeft: number;
  tabTop: number | null;
  tabBottom: number | null;
  radius: number;
  roundEndCorners: boolean;
}) {
  const endRadius = roundEndCorners ? radius : 0;
  if (tabTop === null || tabBottom === null) {
    return [
      `M ${startX} 0`,
      `H ${endX - endRadius}`,
      `Q ${endX} 0 ${endX} ${endRadius}`,
      `V ${height - endRadius}`,
      `Q ${endX} ${height} ${endX - endRadius} ${height}`,
      `H ${startX}`,
      'V 0',
      'Z',
    ].join(' ');
  }

  const joinRadius = Math.min(3, radius);
  const tabRadius = Math.min(radius, (tabBottom - tabTop) / 2, (startX - tabLeft) / 2);
  const touchesTop = tabTop <= 0.5;
  const touchesBottom = tabBottom >= height - 0.5;

  if (touchesTop) {
    return [
      `M ${tabLeft} 0`,
      `H ${endX - endRadius}`,
      `Q ${endX} 0 ${endX} ${endRadius}`,
      `V ${height - endRadius}`,
      `Q ${endX} ${height} ${endX - endRadius} ${height}`,
      `H ${startX}`,
      `V ${tabBottom + joinRadius}`,
      `Q ${startX} ${tabBottom} ${startX - joinRadius} ${tabBottom}`,
      `H ${tabLeft + tabRadius}`,
      `Q ${tabLeft} ${tabBottom} ${tabLeft} ${tabBottom - tabRadius}`,
      'V 0',
      'Z',
    ].join(' ');
  }

  if (touchesBottom) {
    return [
      `M ${startX} 0`,
      `H ${endX - endRadius}`,
      `Q ${endX} 0 ${endX} ${endRadius}`,
      `V ${height - endRadius}`,
      `Q ${endX} ${height} ${endX - endRadius} ${height}`,
      `H ${tabLeft}`,
      `V ${tabTop + tabRadius}`,
      `Q ${tabLeft} ${tabTop} ${tabLeft + tabRadius} ${tabTop}`,
      `H ${startX - joinRadius}`,
      `Q ${startX} ${tabTop} ${startX} ${tabTop - joinRadius}`,
      'V 0',
      'Z',
    ].join(' ');
  }

  return [
    `M ${startX} 0`,
    `H ${endX - endRadius}`,
    `Q ${endX} 0 ${endX} ${endRadius}`,
    `V ${height - endRadius}`,
    `Q ${endX} ${height} ${endX - endRadius} ${height}`,
    `H ${startX}`,
    `V ${tabBottom + joinRadius}`,
    `Q ${startX} ${tabBottom} ${startX - joinRadius} ${tabBottom}`,
    `H ${tabLeft + tabRadius}`,
    `Q ${tabLeft} ${tabBottom} ${tabLeft} ${tabBottom - tabRadius}`,
    `V ${tabTop + tabRadius}`,
    `Q ${tabLeft} ${tabTop} ${tabLeft + tabRadius} ${tabTop}`,
    `H ${startX - joinRadius}`,
    `Q ${startX} ${tabTop} ${startX} ${tabTop - joinRadius}`,
    'V 0',
    'Z',
  ].join(' ');
}

function sameLayerGeometry(current: NestedTabsLayerGeometry | null, next: NestedTabsLayerGeometry) {
  return current?.width === next.width && current.height === next.height && current.path === next.path;
}

interface NestedTabsGeometryElements {
  root: HTMLDivElement;
  level: HTMLElement;
  items: HTMLElement;
  target: HTMLElement;
  activeItem: HTMLElement;
}

function nestedTabsGeometryElements(root: HTMLDivElement, levelIndex: number): NestedTabsGeometryElements | null {
  const level = root.querySelector<HTMLElement>(`[data-nested-tabs-level="${levelIndex + 1}"]`);
  if (!level) {
    return null;
  }
  const items = level.querySelector<HTMLElement>('[data-nested-tabs-items]');
  if (!items) {
    return null;
  }
  const target = root.querySelector<HTMLElement>(
    levelIndex === 0 ? '[data-nested-tabs-level="2"]' : '[data-nested-tabs-content]'
  );
  if (!target) {
    return null;
  }
  const activeItem = level.querySelector<HTMLElement>(
    levelIndex === 0
      ? '[data-nested-tabs-item][data-path-state="ancestor"], [data-nested-tabs-item][data-path-state="active"]'
      : '[data-nested-tabs-item][data-path-state="active"]'
  );
  if (!activeItem) {
    return null;
  }
  return { root, level, items, target, activeItem };
}

function measureNestedTabsLayer(
  { root, items, target, activeItem }: NestedTabsGeometryElements,
  levelIndex: number
): NestedTabsLayerGeometry {
  const rootRect = root.getBoundingClientRect();
  const itemsRect = items.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const tabRect = activeItem.getBoundingClientRect();
  const scrollEnd = items.scrollHeight - items.clientHeight;
  items.toggleAttribute('data-scroll-before', items.scrollTop > 1);
  items.toggleAttribute('data-scroll-after', items.scrollTop < scrollEnd - 1);
  const devicePixelRatio = window.devicePixelRatio || 1;
  const round = (number: number) => Math.round(number * devicePixelRatio) / devicePixelRatio;
  const width = round(rootRect.width);
  const height = round(rootRect.height);
  const startX = round(targetRect.left - rootRect.left);
  const endX = round((levelIndex === 0 ? targetRect.right : rootRect.right) - rootRect.left);
  const tabLeft = round(tabRect.left - rootRect.left);
  const tabIsVisible = tabRect.top >= itemsRect.top - 0.5 && tabRect.bottom <= itemsRect.bottom + 0.5;
  const tabTop = tabIsVisible ? round(tabRect.top - rootRect.top) : null;
  const tabBottom = tabIsVisible ? round(tabRect.bottom - rootRect.top) : null;
  const configuredRadius = Number.parseFloat(getComputedStyle(root).getPropertyValue('--nested-tabs-radius'));
  const radius = Number.isFinite(configuredRadius) ? configuredRadius : 8;
  const path = buildNestedTabsLayerPath({
    height,
    startX,
    endX,
    tabLeft,
    tabTop,
    tabBottom,
    radius,
    roundEndCorners: levelIndex === 1,
  });
  return { width, height, path };
}

function revealNestedTabsActiveItem({ items, activeItem }: NestedTabsGeometryElements) {
  const itemsRect = items.getBoundingClientRect();
  const tabRect = activeItem.getBoundingClientRect();
  const neighborSpace = Math.min(tabRect.height + 6, Math.max(0, (itemsRect.height - tabRect.height) / 2));
  const revealTop = itemsRect.top + neighborSpace;
  const revealBottom = itemsRect.bottom - neighborSpace;
  if (tabRect.top < revealTop) {
    items.scrollTop -= revealTop - tabRect.top;
  } else if (tabRect.bottom > revealBottom) {
    items.scrollTop += tabRect.bottom - revealBottom;
  }
}

function observeNestedTabsLayerGeometry({
  elements,
  levelIndex,
  setGeometry,
}: {
  elements: NestedTabsGeometryElements;
  levelIndex: number;
  setGeometry: Dispatch<SetStateAction<NestedTabsLayerGeometry | null>>;
}) {
  const { root, level, items, target, activeItem } = elements;
  let animationFrame = 0;
  const measure = () => {
    const next = measureNestedTabsLayer(elements, levelIndex);
    setGeometry((current) => (sameLayerGeometry(current, next) ? current : next));
  };
  const scheduleMeasure = () => {
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(measure);
  };
  const revealActiveItemAfterResize = () => {
    revealNestedTabsActiveItem(elements);
    scheduleMeasure();
  };

  revealNestedTabsActiveItem(elements);
  measure();
  items.addEventListener('scroll', scheduleMeasure, { passive: true });
  const mutationObserver = new MutationObserver(scheduleMeasure);
  mutationObserver.observe(level, { childList: true, subtree: true });

  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(revealActiveItemAfterResize);
  resizeObserver?.observe(root);
  resizeObserver?.observe(items);
  resizeObserver?.observe(target);
  resizeObserver?.observe(activeItem);

  return () => {
    cancelAnimationFrame(animationFrame);
    items.removeEventListener('scroll', scheduleMeasure);
    mutationObserver.disconnect();
    resizeObserver?.disconnect();
  };
}

function useNestedTabsLayerGeometry({
  activePath,
  rootRef,
  levelIndex,
}: {
  activePath: NestedTabsPath;
  rootRef: RefObject<HTMLDivElement | null>;
  levelIndex: number;
}) {
  const [geometry, setGeometry] = useState<NestedTabsLayerGeometry | null>(null);
  const pathKey = activePath.join('/');

  useLayoutEffect(() => {
    void pathKey;
    const root = rootRef.current;
    if (!root) {
      setGeometry(null);
      return;
    }
    const elements = nestedTabsGeometryElements(root, levelIndex);
    if (!elements) {
      setGeometry(null);
      return;
    }
    return observeNestedTabsLayerGeometry({ elements, levelIndex, setGeometry });
  }, [levelIndex, pathKey, rootRef]);

  return geometry;
}

function NestedTabsConnectedSurface({
  geometry,
  layer,
}: {
  geometry: NestedTabsLayerGeometry | null;
  layer: 'level' | 'panel';
}) {
  const instanceId = useId().replaceAll(':', '');
  const clipId = `nested-tabs-${layer}-clip-${instanceId}`;
  const shadowId = `nested-tabs-${layer}-shadow-${instanceId}`;

  return (
    <div className={styles.surfaceLayer} data-nested-tabs-surface={layer} aria-hidden>
      {geometry ? (
        <>
          <svg className={styles.definitions} width="0" height="0" aria-hidden="true" focusable="false">
            <defs>
              <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                <path d={geometry.path} />
              </clipPath>
              <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
                <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="shadowBlur" />
                <feComposite in="shadowBlur" in2="SourceAlpha" operator="out" result="outsideShadowAlpha" />
                <feFlood floodColor="#000000" floodOpacity="0.165" result="shadowColor" />
                <feComposite in="shadowColor" in2="outsideShadowAlpha" operator="in" result="shadow" />
              </filter>
            </defs>
          </svg>
          <svg
            className={styles.geometryShadow}
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path d={geometry.path} filter={`url(#${shadowId})`} />
          </svg>
          <div className={styles.glassSurface} style={{ clipPath: `url(#${clipId})` }} />
          <svg
            className={styles.geometryContour}
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path d={geometry.path} />
          </svg>
        </>
      ) : null}
    </div>
  );
}

function useNestedTabsContext(component: string) {
  const context = useContext(NestedTabsContext);
  if (!context) {
    throw new Error(`[NestedTabs.${component}] must be rendered inside NestedTabs.Level.`);
  }
  return context;
}

function NestedTabsTooltip({
  label,
  isScrolling,
  children,
}: {
  label: string;
  isScrolling: boolean;
  children: ReactElement;
}) {
  const [opened, setOpened] = useState(false);
  const openTimer = useRef(0);

  useLayoutEffect(() => {
    if (isScrolling) {
      window.clearTimeout(openTimer.current);
      setOpened(false);
    }
    return () => window.clearTimeout(openTimer.current);
  }, [isScrolling]);

  const handleMouseEnter = () => {
    if (isScrolling) {
      return;
    }
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => setOpened(true), 350);
  };
  const handleMouseLeave = () => {
    window.clearTimeout(openTimer.current);
    setOpened(false);
  };

  return (
    <Tooltip
      label={label}
      position="right"
      withArrow
      opened={opened && !isScrolling}
      events={{ hover: false, focus: false, touch: false }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </Tooltip>
  );
}

function pathsEqual(left: NestedTabsPath, right: NestedTabsPath) {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function isPathPrefix(prefix: NestedTabsPath, path: NestedTabsPath) {
  return prefix.length < path.length && prefix.every((part, index) => part === path[index]);
}

type ItemPathState = 'active' | 'ancestor' | 'inactive';

function itemPathState(path: NestedTabsPath, activePath: NestedTabsPath): ItemPathState {
  if (pathsEqual(path, activePath)) {
    return 'active';
  }
  if (isPathPrefix(path, activePath)) {
    return 'ancestor';
  }
  return 'inactive';
}

interface NestedTabsItemOwnProps {
  path: NestedTabsPath;
  label: string;
  icon: ReactNode;
  className?: string;
}

type NestedTabsItemProps<Root extends ElementType> = NestedTabsItemOwnProps &
  Omit<ComponentPropsWithoutRef<Root>, keyof NestedTabsItemOwnProps | 'as' | 'children' | 'aria-label' | 'title'> & {
    as: Root;
  };

type NestedTabsRouterItemProps<
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = NestedTabsItemOwnProps &
  LinkComponentProps<'a', RegisteredRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {
    as: typeof Link;
    children?: never;
    'aria-label'?: never;
    title?: never;
  };

function Item<
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(props: NestedTabsRouterItemProps<TFrom, TTo, TMaskFrom, TMaskTo>): ReactElement;
function Item<Root extends ElementType>(props: NestedTabsItemProps<Root>): ReactElement;
function Item<Root extends ElementType>({
  as: Root,
  path,
  label,
  icon,
  className,
  ...rootProps
}: NestedTabsItemProps<Root>) {
  const { activePath, isScrolling } = useNestedTabsContext('Item');
  const pathState = itemPathState(path, activePath);
  const itemRoot = createElement(
    Root,
    {
      ...rootProps,
      className: clsx(styles.item, className),
      'aria-current': pathState === 'active' ? 'page' : undefined,
      'aria-label': label,
      'data-nested-tabs-item': true,
      'data-path-state': pathState,
    } as ComponentPropsWithoutRef<Root>,
    <span className={styles.itemIcon} aria-hidden>
      {icon}
    </span>
  );

  return (
    <li className={styles.itemSlot}>
      <NestedTabsTooltip label={label} isScrolling={isScrolling}>
        {itemRoot}
      </NestedTabsTooltip>
    </li>
  );
}

interface NestedTabsGroupOwnProps extends PropsWithChildren {
  label: string;
  icon?: ReactNode;
  className?: string;
}

type NestedTabsGroupProps<Root extends ElementType> = NestedTabsGroupOwnProps &
  Omit<ComponentPropsWithoutRef<Root>, keyof NestedTabsGroupOwnProps | 'as'> & {
    as?: Root;
  };

function descendantItemPaths(children: ReactNode): NestedTabsPath[] {
  const paths: NestedTabsPath[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    if (nestedTabsChildKind(child) === 'item') {
      paths.push((child.props as NestedTabsItemOwnProps).path);
      return;
    }
    if (nestedTabsChildKind(child) === 'group') {
      paths.push(...descendantItemPaths((child.props as NestedTabsGroupOwnProps).children));
    }
  });
  return paths;
}

function Group<Root extends ElementType = 'li'>({
  as,
  label,
  icon,
  className,
  children,
  ...rootProps
}: NestedTabsGroupProps<Root>) {
  const { activePath, isScrolling } = useNestedTabsContext('Group');
  const containsActiveItem = descendantItemPaths(children).some((path) => pathsEqual(path, activePath));
  const GroupRoot = as ?? 'li';

  return createElement(
    GroupRoot,
    {
      ...rootProps,
      className: clsx(styles.group, className),
      'data-contains-active-item': containsActiveItem || undefined,
    } as ComponentPropsWithoutRef<Root>,
    <>
      <NestedTabsTooltip label={label} isScrolling={isScrolling}>
        <span className={styles.groupAdornment} aria-hidden>
          {icon ?? <span className={styles.groupMarker} />}
        </span>
      </NestedTabsTooltip>
      <ul className={styles.groupItems} aria-label={label}>
        {children}
      </ul>
    </>
  );
}

interface NestedTabsToolsProps extends PropsWithChildren {}

function Tools(_: NestedTabsToolsProps): null {
  return null;
}

interface NestedTabsLevelProps extends PropsWithChildren {
  label: string;
}

function Level(_: NestedTabsLevelProps): null {
  return null;
}

interface NestedTabsContentPanelProps extends PropsWithChildren {
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

function ContentPanel(_: NestedTabsContentPanelProps): null {
  return null;
}

function splitLevelChildren(children: ReactNode) {
  const entries: ReactNode[] = [];
  let tools: ReactNode = null;

  Children.forEach(children, (child) => {
    if (isValidElement<NestedTabsToolsProps>(child) && nestedTabsChildKind(child) === 'tools') {
      if (tools !== null) {
        throw new Error('[NestedTabs.Level] accepts at most one direct NestedTabs.Tools child.');
      }
      tools = child.props.children;
      return;
    }
    entries.push(child);
  });

  return { entries, tools };
}

function NestedTabsLevelView({
  activePath,
  levelIndex,
  label,
  children,
}: NestedTabsLevelProps & { activePath: NestedTabsPath; levelIndex: number }) {
  const { entries, tools } = splitLevelChildren(children);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollingTimer = useRef(0);

  useLayoutEffect(
    () => () => {
      window.clearTimeout(scrollingTimer.current);
    },
    []
  );

  const handleScroll = () => {
    setIsScrolling(true);
    window.clearTimeout(scrollingTimer.current);
    scrollingTimer.current = window.setTimeout(() => setIsScrolling(false), 650);
  };

  return (
    <NestedTabsContext.Provider value={{ activePath, isScrolling, levelIndex }}>
      <nav className={styles.level} aria-label={label} data-nested-tabs-level={levelIndex + 1}>
        <ul
          className={styles.levelItems}
          data-nested-tabs-items
          data-scrolling={isScrolling || undefined}
          onScroll={handleScroll}
        >
          {entries}
        </ul>
        <div className={styles.levelFooter}>
          {tools ? <div className={styles.levelTools}>{tools}</div> : null}
          <span className={styles.levelLabel} aria-hidden>
            {label}
          </span>
        </div>
      </nav>
    </NestedTabsContext.Provider>
  );
}

export interface NestedTabsProps extends PropsWithChildren {
  activePath: NestedTabsPath;
  ariaLabel: string;
  className?: string;
}

function splitRootChildren(children: ReactNode) {
  const levels: ReactElement<NestedTabsLevelProps>[] = [];
  const panels: ReactElement<NestedTabsContentPanelProps>[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    if (nestedTabsChildKind(child) === 'level') {
      levels.push(child as ReactElement<NestedTabsLevelProps>);
      return;
    }
    if (nestedTabsChildKind(child) === 'content-panel') {
      panels.push(child as ReactElement<NestedTabsContentPanelProps>);
      return;
    }
    throw new Error('[NestedTabs] direct children must be NestedTabs.Level or NestedTabs.ContentPanel.');
  });

  if (levels.length !== 2) {
    throw new Error(`[NestedTabs] accepts exactly two NestedTabs.Level children; received ${levels.length}.`);
  }
  if (panels.length !== 1) {
    throw new Error(`[NestedTabs] accepts exactly one NestedTabs.ContentPanel child; received ${panels.length}.`);
  }

  return { levels, panel: panels[0] };
}

function NestedTabsBase({ activePath, ariaLabel, className, children }: NestedTabsProps) {
  const { levels, panel } = splitRootChildren(children);
  const rootRef = useRef<HTMLDivElement>(null);
  const levelGeometry = useNestedTabsLayerGeometry({ activePath, rootRef, levelIndex: 0 });
  const panelGeometry = useNestedTabsLayerGeometry({ activePath, rootRef, levelIndex: 1 });

  return (
    <aside className={clsx(styles.host, className)} aria-label={ariaLabel}>
      <div ref={rootRef} className={styles.root}>
        <div className={styles.baseSurface} aria-hidden />
        <NestedTabsConnectedSurface geometry={levelGeometry} layer="level" />
        <NestedTabsConnectedSurface geometry={panelGeometry} layer="panel" />
        {levels.map((level, index) => (
          <NestedTabsLevelView
            activePath={activePath}
            levelIndex={index}
            label={level.props.label}
            key={level.key ?? index}
          >
            {level.props.children}
          </NestedTabsLevelView>
        ))}
        <section
          className={styles.contentPanel}
          data-nested-tabs-content
          aria-label={panel.props['aria-label']}
          aria-labelledby={panel.props['aria-labelledby']}
        >
          <PaintedSurfaceBoundary>{panel.props.children}</PaintedSurfaceBoundary>
        </section>
      </div>
    </aside>
  );
}

type NestedTabsComponent = ((props: NestedTabsProps) => ReactNode) & {
  Level: typeof Level;
  Item: typeof Item;
  Group: typeof Group;
  Tools: typeof Tools;
  ContentPanel: typeof ContentPanel;
};

markNestedTabsChild(Item, 'item');
markNestedTabsChild(Group, 'group');
markNestedTabsChild(Tools, 'tools');
markNestedTabsChild(Level, 'level');
markNestedTabsChild(ContentPanel, 'content-panel');

export const NestedTabs = Object.assign(NestedTabsBase, {
  Level,
  Item,
  Group,
  Tools,
  ContentPanel,
}) as NestedTabsComponent;
