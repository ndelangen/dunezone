import * as Select from '@radix-ui/react-select';
import * as Tabs from '@radix-ui/react-tabs';
import clsx from 'clsx';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import styles from './ConnectedTabs.module.css';

export interface ConnectedTabsItem<Value extends string> {
  value: Value;
  /** Words, so a string: the narrow layout puts this same text inside a native select. */
  label: string;
  icon: ReactNode;
  indicator?: ReactNode;
  disabled?: boolean;
  panel: ReactNode;
}

export interface ConnectedTabsProps<Value extends string> {
  value: Value;
  onValueChange: (value: Value) => void;
  items: readonly ConnectedTabsItem<Value>[];
  ariaLabel: string;
  className?: string;
  panelClassName?: string;
  style?: CSSProperties;
}

interface ConnectedTabsGeometry {
  width: number;
  height: number;
  path: string;
}

export function buildConnectedTabsPath({
  width,
  height,
  panelX,
  tabTop,
  tabBottom,
  radius,
}: {
  width: number;
  height: number;
  panelX: number;
  tabTop: number;
  tabBottom: number;
  radius: number;
}): string {
  const joinRadius = Math.min(3, radius);
  const tabRadius = Math.min(radius, (tabBottom - tabTop) / 2, panelX / 2);
  const touchesTop = tabTop <= 0.5;
  const touchesBottom = tabBottom >= height - 0.5;

  if (touchesTop) {
    return [
      `M ${tabRadius} 0`,
      `H ${width - radius}`,
      `Q ${width} 0 ${width} ${radius}`,
      `V ${height - radius}`,
      `Q ${width} ${height} ${width - radius} ${height}`,
      `H ${panelX + radius}`,
      `Q ${panelX} ${height} ${panelX} ${height - radius}`,
      `V ${tabBottom + joinRadius}`,
      `Q ${panelX} ${tabBottom} ${panelX - joinRadius} ${tabBottom}`,
      `H ${tabRadius}`,
      `Q 0 ${tabBottom} 0 ${tabBottom - tabRadius}`,
      `V ${tabRadius}`,
      `Q 0 0 ${tabRadius} 0`,
      'Z',
    ].join(' ');
  }

  if (touchesBottom) {
    return [
      `M ${panelX + radius} 0`,
      `H ${width - radius}`,
      `Q ${width} 0 ${width} ${radius}`,
      `V ${height - radius}`,
      `Q ${width} ${height} ${width - radius} ${height}`,
      `H ${tabRadius}`,
      `Q 0 ${height} 0 ${height - tabRadius}`,
      `V ${tabTop + tabRadius}`,
      `Q 0 ${tabTop} ${tabRadius} ${tabTop}`,
      `H ${panelX - joinRadius}`,
      `Q ${panelX} ${tabTop} ${panelX} ${tabTop - joinRadius}`,
      `V ${radius}`,
      `Q ${panelX} 0 ${panelX + radius} 0`,
      'Z',
    ].join(' ');
  }

  return [
    `M ${panelX + radius} 0`,
    `H ${width - radius}`,
    `Q ${width} 0 ${width} ${radius}`,
    `V ${height - radius}`,
    `Q ${width} ${height} ${width - radius} ${height}`,
    `H ${panelX + radius}`,
    `Q ${panelX} ${height} ${panelX} ${height - radius}`,
    `V ${tabBottom + joinRadius}`,
    `Q ${panelX} ${tabBottom} ${panelX - joinRadius} ${tabBottom}`,
    `H ${tabRadius}`,
    `Q 0 ${tabBottom} 0 ${tabBottom - tabRadius}`,
    `V ${tabTop + tabRadius}`,
    `Q 0 ${tabTop} ${tabRadius} ${tabTop}`,
    `H ${panelX - joinRadius}`,
    `Q ${panelX} ${tabTop} ${panelX} ${tabTop - joinRadius}`,
    `V ${radius}`,
    `Q ${panelX} 0 ${panelX + radius} 0`,
    'Z',
  ].join(' ');
}

/**
 * Whether a fresh measurement says anything new.
 * Observers fire on every frame of a resize, and most of those frames land on the same rounded pixels — keeping the old object keeps the surface from re-rendering for a measurement that did not move.
 */
function isSameGeometry(current: ConnectedTabsGeometry | null, next: ConnectedTabsGeometry) {
  return current?.width === next.width && current.height === next.height && current.path === next.path;
}

function useConnectedTabsGeometry({
  value,
  rootRef,
  panelRef,
}: {
  value: string;
  rootRef: React.RefObject<HTMLDivElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [geometry, setGeometry] = useState<ConnectedTabsGeometry | null>(null);

  useLayoutEffect(() => {
    // The selected trigger changes without changing either element ref.
    void value;
    const root = rootRef.current;
    const panel = panelRef.current;
    const activeTab = root?.querySelector<HTMLElement>('[data-connected-tab][data-state="active"]');
    if (!root || !panel || !activeTab) {
      setGeometry(null);
      return;
    }

    let animationFrame = 0;
    const measure = () => {
      const rootRect = root.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      const devicePixelRatio = window.devicePixelRatio || 1;
      const round = (number: number) => Math.round(number * devicePixelRatio) / devicePixelRatio;
      const width = round(rootRect.width);
      const height = round(rootRect.height);
      const panelX = round(panelRect.left - rootRect.left);
      const tabTop = round(tabRect.top - rootRect.top);
      const tabBottom = round(tabRect.bottom - rootRect.top);
      const configuredRadius = Number.parseFloat(getComputedStyle(root).getPropertyValue('--connected-tabs-radius'));
      const radius = Number.isFinite(configuredRadius) ? configuredRadius : 8;
      const path = buildConnectedTabsPath({
        width,
        height,
        panelX,
        tabTop,
        tabBottom,
        radius,
      });

      const next = { width, height, path };
      setGeometry((current) => (isSameGeometry(current, next) ? current : next));
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(measure);
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(root);
    observer.observe(panel);
    observer.observe(activeTab);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [panelRef, rootRef, value]);

  return geometry;
}

function ConnectedTabsSurface({ geometry }: { geometry: ConnectedTabsGeometry | null }) {
  const instanceId = useId().replaceAll(':', '');
  const clipId = `connected-tabs-clip-${instanceId}`;
  const shadowId = `connected-tabs-shadow-${instanceId}`;

  return (
    <div className={styles.surfaceLayer} aria-hidden>
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

function findAdjacentEnabledValue<Value extends string>({
  value,
  items,
  direction,
}: {
  value: Value;
  items: readonly ConnectedTabsItem<Value>[];
  direction: -1 | 1;
}): Value {
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === value)
  );

  for (let offset = 1; offset <= items.length; offset += 1) {
    const index = (selectedIndex + direction * offset + items.length) % items.length;
    const item = items[index];
    if (item && !item.disabled) {
      return item.value;
    }
  }

  return value;
}

export function ConnectedTabs<Value extends string>({
  value,
  onValueChange,
  items,
  ariaLabel,
  className,
  panelClassName,
  style,
}: ConnectedTabsProps<Value>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const geometry = useConnectedTabsGeometry({ value, rootRef, panelRef });
  const activeItem = items.find((item) => item.value === value);
  const hasMultipleEnabledItems = items.filter((item) => !item.disabled).length > 1;
  const selectAdjacent = (direction: -1 | 1) => onValueChange(findAdjacentEnabledValue({ value, items, direction }));

  return (
    <div className={clsx(styles.host, className)} style={style}>
      <Tabs.Root
        ref={rootRef}
        className={styles.root}
        value={value}
        onValueChange={(nextValue) => onValueChange(nextValue as Value)}
        orientation="vertical"
        activationMode="automatic"
      >
        <ConnectedTabsSurface geometry={geometry} />
        {activeItem ? (
          <div className={styles.mobilePicker} data-connected-tabs-mobile-picker>
            <button
              type="button"
              className={styles.mobileStepButton}
              aria-label="Previous section"
              disabled={!hasMultipleEnabledItems}
              onClick={() => selectAdjacent(-1)}
            >
              <ChevronLeft size={18} aria-hidden />
            </button>
            <Select.Root value={value} onValueChange={(nextValue) => onValueChange(nextValue as Value)}>
              <Select.Trigger className={styles.mobileSelect} aria-label={ariaLabel}>
                <span className={styles.mobileIconDisc} aria-hidden>
                  {activeItem.icon}
                </span>
                <Select.Value className={styles.mobileSelectValue}>{activeItem.label}</Select.Value>
                {activeItem.indicator ? <span className={styles.mobileIndicator}>{activeItem.indicator}</span> : null}
                <Select.Icon className={styles.mobileSelectIcon}>
                  <ChevronDown size={15} aria-hidden />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className={styles.mobileSelectContent} position="popper" sideOffset={4}>
                  <Select.Viewport className={styles.mobileSelectViewport}>
                    {items.map((item) => (
                      <Select.Item
                        className={styles.mobileSelectItem}
                        key={item.value}
                        value={item.value}
                        disabled={item.disabled}
                      >
                        <span className={styles.mobileItemIcon} aria-hidden>
                          {item.icon}
                        </span>
                        <Select.ItemText>{item.label}</Select.ItemText>
                        {item.indicator ? <span className={styles.mobileIndicator}>{item.indicator}</span> : null}
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
            <button
              type="button"
              className={styles.mobileStepButton}
              aria-label="Next section"
              disabled={!hasMultipleEnabledItems}
              onClick={() => selectAdjacent(1)}
            >
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
        ) : null}
        <Tabs.List className={styles.tabList} aria-label={ariaLabel}>
          {items.map((item) => (
            <Tabs.Trigger
              className={styles.tab}
              data-connected-tab
              key={item.value}
              value={item.value}
              disabled={item.disabled}
            >
              <span className={styles.iconDisc} aria-hidden>
                {item.icon}
              </span>
              <span className={styles.label}>{item.label}</span>
              {item.indicator ? <span className={styles.indicator}>{item.indicator}</span> : null}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div ref={panelRef} className={clsx(styles.panelShell, panelClassName)}>
          {items.map((item) => (
            <Tabs.Content className={styles.panel} key={item.value} value={item.value}>
              {item.panel}
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>
    </div>
  );
}
