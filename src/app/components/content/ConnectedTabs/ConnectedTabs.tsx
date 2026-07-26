import * as Tabs from '@radix-ui/react-tabs';
import clsx from 'clsx';
import {
  type CSSProperties,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import styles from './ConnectedTabs.module.css';

export interface ConnectedTabsItem<Value extends string> {
  value: Value;
  label: ReactNode;
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

function ConnectedTabsSurface({
  value,
  rootRef,
  panelRef,
}: {
  value: string;
  rootRef: React.RefObject<HTMLDivElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [geometry, setGeometry] = useState<ConnectedTabsGeometry | null>(null);
  const instanceId = useId().replaceAll(':', '');
  const clipId = `connected-tabs-clip-${instanceId}`;
  const shadowId = `connected-tabs-shadow-${instanceId}`;

  useLayoutEffect(() => {
    void value;
    const root = rootRef.current;
    const panel = panelRef.current;
    const activeTab = root?.querySelector<HTMLElement>('[data-connected-tab][data-state="active"]');
    if (!root || !panel || !activeTab || typeof ResizeObserver === 'undefined') return;

    let animationFrame = 0;
    const measure = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
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
        const configuredRadius = Number.parseFloat(
          getComputedStyle(root).getPropertyValue('--connected-tabs-radius')
        );
        const radius = Number.isFinite(configuredRadius) ? configuredRadius : 8;
        const path = buildConnectedTabsPath({
          width,
          height,
          panelX,
          tabTop,
          tabBottom,
          radius,
        });

        setGeometry((current) =>
          current?.width === width && current.height === height && current.path === path
            ? current
            : { width, height, path }
        );
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(panel);
    observer.observe(activeTab);
    measure();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [panelRef, rootRef, value]);

  return (
    <div className={styles.surfaceLayer} aria-hidden>
      {geometry ? (
        <>
          <svg
            className={styles.definitions}
            width="0"
            height="0"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                <path d={geometry.path} />
              </clipPath>
              <filter
                id={shadowId}
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="shadowBlur" />
                <feComposite
                  in="shadowBlur"
                  in2="SourceAlpha"
                  operator="out"
                  result="outsideShadowAlpha"
                />
                <feFlood floodColor="#000000" floodOpacity="0.165" result="shadowColor" />
                <feComposite
                  in="shadowColor"
                  in2="outsideShadowAlpha"
                  operator="in"
                  result="shadow"
                />
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
        <ConnectedTabsSurface value={value} rootRef={rootRef} panelRef={panelRef} />
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
