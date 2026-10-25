import { Tooltip } from '@mantine/core';
import type { Link, LinkComponentProps, RegisteredRouter } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  Children,
  createElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useEffectEvent,
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
  FocusEvent,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  PropsWithChildren,
  ReactElement,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react';

import { GlassOutline, isSameGeometry } from './GlassOutline';
import type { GlassOutlineGeometry } from './GlassOutline';
import styles from './NestedTabs.module.css';
import { PaintedSurfaceBoundary } from './Surface';

export type NestedTabsPath = readonly string[];

interface NestedTabsTabsWiring {
  /** Prefixes every tab's id, so two NestedTabs on one page never share one. */
  idBase: string;
  panelId: string;
}

interface NestedTabsContextValue {
  activePath: NestedTabsPath;
  isScrolling: boolean;
  levelIndex: number;
  /** Set when every item switches content in place, so the levels are tablists rather than navigation. */
  tabs: (NestedTabsTabsWiring & { tabStopPath: NestedTabsPath | null }) | null;
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

interface NestedTabsGeometryElements {
  root: HTMLDivElement;
  level: HTMLElement;
  items: HTMLElement;
  target: HTMLElement;
  activeItem: HTMLElement;
}

/* A level connects to the next level, or, when it is the last one, straight to the content panel;
   with one level that is the first. */
function nestedTabsGeometryElements(
  root: HTMLDivElement,
  levelIndex: number,
  levelCount: number
): NestedTabsGeometryElements | null {
  const level = root.querySelector<HTMLElement>(`[data-nested-tabs-level="${levelIndex + 1}"]`);
  if (!level) {
    return null;
  }
  const items = level.querySelector<HTMLElement>('[data-nested-tabs-items]');
  if (!items) {
    return null;
  }
  const last = levelIndex === levelCount - 1;
  const target = root.querySelector<HTMLElement>(
    last ? '[data-nested-tabs-content]' : `[data-nested-tabs-level="${levelIndex + 2}"]`
  );
  if (!target) {
    return null;
  }
  const activeItem = level.querySelector<HTMLElement>(
    last
      ? '[data-nested-tabs-item][data-path-state="active"]'
      : '[data-nested-tabs-item][data-path-state="ancestor"], [data-nested-tabs-item][data-path-state="active"]'
  );
  if (!activeItem) {
    return null;
  }
  return { root, level, items, target, activeItem };
}

function measureNestedTabsLayer(
  { root, items, target, activeItem }: NestedTabsGeometryElements,
  last: boolean
): GlassOutlineGeometry {
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
  const endX = round((last ? rootRect.right : targetRect.right) - rootRect.left);
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
    roundEndCorners: last,
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
  last,
  setGeometry,
}: {
  elements: NestedTabsGeometryElements;
  last: boolean;
  setGeometry: Dispatch<SetStateAction<GlassOutlineGeometry | null>>;
}) {
  const { root, level, items, target, activeItem } = elements;
  let animationFrame = 0;
  const measure = () => {
    const next = measureNestedTabsLayer(elements, last);
    setGeometry((current) => (isSameGeometry(current, next) ? current : next));
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
  levelCount,
}: {
  activePath: NestedTabsPath;
  rootRef: RefObject<HTMLDivElement | null>;
  levelIndex: number;
  levelCount: number;
}) {
  const [geometry, setGeometry] = useState<GlassOutlineGeometry | null>(null);
  const pathKey = activePath.join('/');

  useLayoutEffect(() => {
    void pathKey;
    const root = rootRef.current;
    if (!root || levelIndex >= levelCount) {
      setGeometry(null);
      return;
    }
    const elements = nestedTabsGeometryElements(root, levelIndex, levelCount);
    if (!elements) {
      setGeometry(null);
      return;
    }
    return observeNestedTabsLayerGeometry({ elements, last: levelIndex === levelCount - 1, setGeometry });
  }, [levelCount, levelIndex, pathKey, rootRef]);

  return geometry;
}

function nestedTabId(idBase: string, path: NestedTabsPath) {
  return `${idBase}-tab-${path.map(encodeURIComponent).join('/')}`;
}

function useNestedTabsContext(component: string) {
  const context = useContext(NestedTabsContext);
  if (!context) {
    throw new Error(`[NestedTabs.${component}] must be rendered inside NestedTabs.Level.`);
  }
  return context;
}

/* A hover names the item and says what it is for; resting on it a while longer brings its full help. */
const TOOLTIP_OPEN_MS = 350;
const PANEL_TOOLTIP_OPEN_MS = 5000;
const TOOLTIP_HELP_MS = 1800;

function NestedTabsTooltip({
  label,
  description,
  help,
  isScrolling,
  hoverDelay = TOOLTIP_OPEN_MS,
  children,
}: {
  label: string;
  description?: string;
  help?: string;
  isScrolling: boolean;
  hoverDelay?: number;
  children: ReactElement<
    Pick<
      HTMLAttributes<HTMLElement>,
      'onFocus' | 'onBlur' | 'onMouseOver' | 'onMouseOut' | 'onPointerDown' | 'onClick' | 'onKeyDown'
    >
  >;
}) {
  const [shown, setShown] = useState<'closed' | 'short' | 'help'>('closed');
  if (isScrolling && shown !== 'closed') {
    setShown('closed');
  }
  const openTimer = useRef(0);
  const helpTimer = useRef(0);
  /* The pointer resting on the item, or keyboard focus on it: either keeps the tooltip coming. */
  const engaged = useRef({ pointer: false, focus: false });
  const pointerDismissed = useRef(false);

  const clearTimers = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(helpTimer.current);
  };
  const arm = () => {
    clearTimers();
    const delay = engaged.current.focus ? TOOLTIP_OPEN_MS : hoverDelay;
    openTimer.current = window.setTimeout(() => setShown('short'), delay);
    if (help) {
      helpTimer.current = window.setTimeout(() => setShown('help'), delay + TOOLTIP_HELP_MS - TOOLTIP_OPEN_MS);
    }
  };
  const release = (cause: 'pointer' | 'focus') => {
    engaged.current[cause] = false;
    if (!engaged.current.pointer && !engaged.current.focus) {
      clearTimers();
      setShown('closed');
    }
  };
  const engage = (cause: 'pointer' | 'focus') => {
    engaged.current[cause] = true;
    if (!isScrolling) {
      arm();
    }
  };

  /* Scrolling the rail closes the tooltip; an item still under the pointer once it settles starts over. */
  const settle = useEffectEvent((scrolling: boolean) => {
    if (scrolling) {
      clearTimers();
    } else if (engaged.current.pointer || engaged.current.focus) {
      arm();
    }
  });
  useLayoutEffect(() => {
    settle(isScrolling);
    return () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(helpTimer.current);
    };
  }, [isScrolling]);

  /* The controlled tooltip loses Mantine's own Escape, so it is restored here wherever focus is: the tooltip closes, focus stays, and the next hover or focus opens it again. */
  const open = shown !== 'closed';
  useEffect(() => {
    if (!open) {
      return;
    }
    const dismiss = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        engaged.current = { pointer: false, focus: false };
        window.clearTimeout(openTimer.current);
        window.clearTimeout(helpTimer.current);
        setShown('closed');
      }
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open]);

  const text = shown === 'help' ? help : description;

  const Trigger = children.type;
  const dismissPointer = (target: HTMLElement) => {
    pointerDismissed.current = true;
    target.dataset.pointerFocus = '';
    engaged.current = { pointer: false, focus: false };
    clearTimers();
    setShown('closed');
  };
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    dismissPointer(event.currentTarget);
    children.props.onPointerDown?.(event);
  };
  const onClick = (event: MouseEvent<HTMLElement>) => {
    if (event.detail > 0) {
      dismissPointer(event.currentTarget);
    }
    children.props.onClick?.(event);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    delete event.currentTarget.dataset.pointerFocus;
    if (event.key !== 'Escape' && event.key !== 'Tab' && event.currentTarget === document.activeElement) {
      engage('focus');
    }
    children.props.onKeyDown?.(event);
  };
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    children.props.onFocus?.(event);
    if (event.currentTarget.hasAttribute('data-pointer-focus') || !event.currentTarget.matches(':focus-visible')) {
      return;
    }
    /* Focus keeps visible guidance open; pending guidance switches to the keyboard delay. */
    if (engaged.current.pointer && open) {
      engaged.current.focus = true;
    } else {
      engage('focus');
    }
  };
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    delete event.currentTarget.dataset.pointerFocus;
    children.props.onBlur?.(event);
    release('focus');
  };
  /* A portal can disappear before its outgoing event; the next real hover still needs to open guidance. */
  const onMouseOver = (event: MouseEvent<HTMLElement>) => {
    children.props.onMouseOver?.(event);
    if (
      !pointerDismissed.current &&
      !(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
    ) {
      engage('pointer');
    }
  };
  const onMouseOut = (event: MouseEvent<HTMLElement>) => {
    children.props.onMouseOut?.(event);
    if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
      pointerDismissed.current = false;
      release('pointer');
    }
  };
  return (
    <Tooltip
      label={
        text ? (
          <span className={styles.tooltip}>
            <span className={styles.tooltipLabel}>{label}</span>
            <span>{text}</span>
          </span>
        ) : (
          label
        )
      }
      position="right"
      withArrow
      multiline={Boolean(text)}
      maw={text ? 320 : undefined}
      opened={shown !== 'closed' && !isScrolling}
      events={{ hover: false, focus: false, touch: false }}
    >
      <Trigger
        {...children.props}
        key={children.key}
        onFocus={onFocus}
        onBlur={onBlur}
        onMouseOver={onMouseOver}
        onMouseOut={onMouseOut}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onKeyDown={onKeyDown}
      />
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
  /** One line saying what the item opens, shown under its name as the pointer rests on it. */
  description?: string;
  /** The item's full guidance, shown in place of the description once the pointer has rested on it for a while. */
  help?: string;
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
  description,
  help,
  className,
  ...rootProps
}: NestedTabsItemProps<Root>) {
  const { activePath, isScrolling, tabs } = useNestedTabsContext('Item');
  const guidanceId = useId();
  const guidance = [description, help].filter(Boolean).join(' ');
  const pathState = itemPathState(path, activePath);
  /* A tab stays selected while it leads to what the panel shows, so a first-level tab is selected above its own tabs.
     A level has one tab stop, so Tab enters a level once and the arrow keys move within it. */
  const semantics = tabs
    ? {
        role: 'tab',
        id: nestedTabId(tabs.idBase, path),
        'aria-selected': pathState !== 'inactive',
        'aria-controls': tabs.panelId,
        tabIndex: tabs.tabStopPath && pathsEqual(path, tabs.tabStopPath) ? 0 : -1,
      }
    : /* A link item is the current page; a button item among links switches content in place, so it is only current. */
      { 'aria-current': pathState === 'active' ? (Root === 'button' ? 'true' : 'page') : undefined };
  const itemRoot = createElement(
    Root,
    {
      ...rootProps,
      ...semantics,
      className: clsx(styles.item, className),
      'aria-label': label,
      /* The tooltip names nothing to assistive technology, so the item is described by the guidance it shows. */
      'aria-describedby': guidance ? guidanceId : undefined,
      'data-nested-tabs-item': true,
      'data-path-state': pathState,
    } as ComponentPropsWithoutRef<Root>,
    <span className={styles.itemIcon} aria-hidden>
      {icon}
    </span>
  );

  return (
    <li className={styles.itemSlot} role={tabs ? 'none' : undefined}>
      <NestedTabsTooltip
        label={label}
        description={description}
        help={help}
        isScrolling={isScrolling}
        hoverDelay={tabs ? PANEL_TOOLTIP_OPEN_MS : TOOLTIP_OPEN_MS}
      >
        {itemRoot}
      </NestedTabsTooltip>
      {guidance ? (
        <span id={guidanceId} hidden>
          {guidance}
        </span>
      ) : null}
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

type DeclaredItem = NestedTabsItemOwnProps & { as?: unknown };

/* The items a level declares directly or through its groups; an item inside any other wrapper is not seen. */
function descendantItems(children: ReactNode): DeclaredItem[] {
  const items: DeclaredItem[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    if (nestedTabsChildKind(child) === 'item') {
      items.push(child.props as DeclaredItem);
      return;
    }
    if (nestedTabsChildKind(child) === 'group') {
      items.push(...descendantItems((child.props as NestedTabsGroupOwnProps).children));
    }
  });
  return items;
}

function isDisabledItem(item: DeclaredItem) {
  const { disabled, 'aria-disabled': ariaDisabled } = item as DeclaredItem & {
    disabled?: unknown;
    'aria-disabled'?: unknown;
  };
  return Boolean(disabled) || ariaDisabled === true || ariaDisabled === 'true';
}

function descendantItemPaths(children: ReactNode): NestedTabsPath[] {
  return descendantItems(children).map((item) => item.path);
}

function Group<Root extends ElementType = 'li'>({
  as,
  label,
  icon,
  className,
  children,
  ...rootProps
}: NestedTabsGroupProps<Root>) {
  const { activePath, isScrolling, tabs } = useNestedTabsContext('Group');
  const containsActiveItem = descendantItemPaths(children).some((path) => pathsEqual(path, activePath));
  const Root = as ?? 'li';

  return createElement(
    Root,
    {
      ...rootProps,
      className: clsx(styles.group, className),
      /* A tablist owns only tabs, so inside one a group is presentation and its tabs belong to the list. */
      role: tabs ? 'none' : undefined,
      'data-contains-active-item': containsActiveItem || undefined,
    } as ComponentPropsWithoutRef<Root>,
    <>
      <NestedTabsTooltip
        label={label}
        isScrolling={isScrolling}
        hoverDelay={tabs ? PANEL_TOOLTIP_OPEN_MS : TOOLTIP_OPEN_MS}
      >
        <span className={styles.groupAdornment} aria-hidden>
          {icon ?? <span className={styles.groupMarker} />}
        </span>
      </NestedTabsTooltip>
      <ul className={styles.groupItems} role={tabs ? 'none' : undefined} aria-label={tabs ? undefined : label}>
        {children}
      </ul>
    </>
  );
}

interface NestedTabsToolsProps extends PropsWithChildren {}

const Tools: (props: NestedTabsToolsProps) => null = () => null;

interface NestedTabsLevelProps extends PropsWithChildren {
  label: string;
}

const Level: (props: NestedTabsLevelProps) => null = () => null;

interface NestedTabsContentPanelProps extends PropsWithChildren {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  /** Placement only: how the panel sits in a bounded host, such as scrolling inside it. The panel owns its own inset. */
  className?: string;
  /**
   * Whether the panel insets its content at its inline edges.
   * The block inset stays either way.
   * Pass `false` for content that runs edge to edge, such as divided rows whose dividers meet the panel's sides.
   * The inset stays readable inside as `--nested-tabs-panel-inset`, so flush content pads its own text by the same amount.
   */
  padding?: boolean;
}

const ContentPanel: (props: NestedTabsContentPanelProps) => null = () => null;

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

/* Up and Down step through a rail's tabs, wrapping at the ends, and Home and End jump to its ends.
   Focus moves and the panel waits for Enter or Space, since opening a tab mounts its content. */
function moveTabFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')).filter(
    (tab) => !tab.matches(':disabled, [aria-disabled="true"]')
  );
  const index = tabs.indexOf(event.target as HTMLElement);
  if (index < 0) {
    return;
  }
  const targets: Partial<Record<string, number>> = {
    ArrowDown: (index + 1) % tabs.length,
    ArrowUp: (index - 1 + tabs.length) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  };
  const target = targets[event.key];
  if (target === undefined) {
    return;
  }
  event.preventDefault();
  tabs[target]?.focus();
}

function NestedTabsLevelView({
  activePath,
  levelIndex,
  label,
  tabs,
  children,
}: NestedTabsLevelProps & { activePath: NestedTabsPath; levelIndex: number; tabs: NestedTabsTabsWiring | null }) {
  const { entries, tools } = splitLevelChildren(children);
  const items = tabs ? descendantItems(entries) : [];
  /* The tab the keyboard last reached in this list; the tab stop follows it while focus stays inside. */
  const [focusedPath, setFocusedPath] = useState<NestedTabsPath | null>(null);
  const enabled = items.filter((item) => !isDisabledItem(item)).map((item) => item.path);
  const tabStopPath =
    (focusedPath && enabled.find((path) => pathsEqual(path, focusedPath))) ??
    items.map((item) => item.path).find((path) => itemPathState(path, activePath) !== 'inactive') ??
    enabled[0] ??
    null;
  const trackFocus = (event: FocusEvent<HTMLElement>) => {
    const path = tabs && items.find((item) => nestedTabId(tabs.idBase, item.path) === event.target.id)?.path;
    if (path) {
      setFocusedPath(path);
    }
  };
  /* Leaving the list hands the tab stop back to the selected tab, so Tab enters the list there next time. */
  const releaseFocus = (event: FocusEvent<HTMLElement>) => {
    if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
      setFocusedPath(null);
    }
  };
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
    <NestedTabsContext.Provider value={{ activePath, isScrolling, levelIndex, tabs: tabs && { ...tabs, tabStopPath } }}>
      {/* A level of tabs is no landmark: its tablist carries the level's name instead. */}
      {createElement(
        tabs ? 'div' : 'nav',
        {
          className: styles.level,
          'aria-label': tabs ? undefined : label,
          'data-nested-tabs-level': levelIndex + 1,
        },
        tabs ? (
          <ul
            className={styles.levelItems}
            role="tablist"
            aria-label={label}
            aria-orientation="vertical"
            data-nested-tabs-items
            data-scrolling={isScrolling || undefined}
            onScroll={handleScroll}
            onKeyDown={moveTabFocus}
            onFocus={trackFocus}
            onBlur={releaseFocus}
          >
            {entries}
          </ul>
        ) : (
          <ul
            className={styles.levelItems}
            data-nested-tabs-items
            data-scrolling={isScrolling || undefined}
            onScroll={handleScroll}
          >
            {entries}
          </ul>
        ),
        <div className={styles.levelFooter}>
          {tools ? <div className={styles.levelTools}>{tools}</div> : null}
          <span className={styles.levelLabel} aria-hidden>
            {label}
          </span>
        </div>
      )}
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

  if (levels.length < 1 || levels.length > 2) {
    throw new Error(`[NestedTabs] accepts one or two NestedTabs.Level children; received ${levels.length}.`);
  }
  if (panels.length !== 1) {
    throw new Error(`[NestedTabs] accepts exactly one NestedTabs.ContentPanel child; received ${panels.length}.`);
  }

  return { levels, panel: panels[0] };
}

/**
 * Icon-only navigation in one or two connected levels beside a caller-owned content panel.
 * Callers own the path and the navigation;
 * this owns the glass, the contour that joins the active item to what it opens, and the semantics the items carry, which follow from what the items are.
 * When every item is a button, each one switches the panel in place, so each level is a vertical tablist named by its label and the panel is their tabpanel, named by the deepest selected tab.
 * Selection follows the path, and each level has one tab stop: the tab focus last reached inside the level, or its selected tab once focus has left.
 * Up, Down, Home and End move focus between a level's tabs, and Enter or Space opens the focused one: activation is manual, since opening a tab mounts its content.
 * When any item is a link, the items navigate, so each level stays a named `nav` and its current item carries `aria-current`.
 * With two levels the first connects to the second and the second to the panel;
 * with one level, its items connect straight to the panel.
 * An item's tooltip names it;
 * given a `description` it shows that line under the name, and given `help` it swaps in that full guidance 1.45 seconds later.
 * Panel tabs wait five seconds on hover;
 * navigation links and keyboard focus keep the short opening delay.
 * Keyboard focus opens the same tooltip, and both texts describe the item to assistive technology.
 * The tooltip body and its timing live here while this is their one user;
 * a second component wanting a name, a description and rested help moves them to a `ui/content` component this composes.
 */
function NestedTabsBase({ activePath, ariaLabel, className, children }: NestedTabsProps) {
  const { levels, panel } = splitRootChildren(children);
  const { padding = true } = panel.props;
  const idBase = useId();
  const items = levels.flatMap((level) => descendantItems(level.props.children));
  const tabs: NestedTabsTabsWiring | null =
    items.length > 0 && items.every((item) => item.as === 'button') ? { idBase, panelId: `${idBase}-panel` } : null;
  /* The deepest declared prefix of the path: the tab whose content the panel shows. */
  const shownPath = tabs
    ? activePath
        .map((_, index) => activePath.slice(0, activePath.length - index))
        .find((prefix) => items.some((item) => pathsEqual(item.path, prefix)))
    : undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  const levelCount = levels.length;
  const firstGeometry = useNestedTabsLayerGeometry({ activePath, rootRef, levelIndex: 0, levelCount });
  const secondGeometry = useNestedTabsLayerGeometry({ activePath, rootRef, levelIndex: 1, levelCount });

  return (
    <aside className={clsx(styles.host, className)} aria-label={ariaLabel}>
      <div ref={rootRef} className={styles.root} data-nested-tabs-levels={levelCount}>
        <div className={styles.baseSurface} aria-hidden />
        {levelCount === 2 ? (
          <div className={styles.surfaceLayer} data-nested-tabs-surface="level" aria-hidden>
            <GlassOutline geometry={firstGeometry} />
          </div>
        ) : null}
        <div className={styles.surfaceLayer} data-nested-tabs-surface="panel" aria-hidden>
          <GlassOutline geometry={levelCount === 2 ? secondGeometry : firstGeometry} />
        </div>
        {levels.map((level, index) => (
          <NestedTabsLevelView
            activePath={activePath}
            levelIndex={index}
            label={level.props.label}
            tabs={tabs}
            key={level.key ?? index}
          >
            {level.props.children}
          </NestedTabsLevelView>
        ))}
        <section
          className={clsx(styles.contentPanel, !padding && styles.contentPanelFlush, panel.props.className)}
          data-nested-tabs-content
          role={tabs ? 'tabpanel' : undefined}
          id={tabs?.panelId}
          aria-label={panel.props['aria-label']}
          aria-labelledby={
            panel.props['aria-labelledby'] ?? (tabs && shownPath ? nestedTabId(tabs.idBase, shownPath) : undefined)
          }
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
