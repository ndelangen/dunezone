import * as Select from '@radix-ui/react-select';
import * as Tabs from '@radix-ui/react-tabs';
import clsx from 'clsx';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import styles from './ConnectedTabs.module.css';
import { GlassOutline, isSameGeometry } from './GlassOutline';
import type { GlassOutlineGeometry } from './GlassOutline';
import { PaintedSurfaceBoundary } from './Surface';

export interface ConnectedTabsItem<Value extends string> {
  value: Value;
  /** Words, so a string: the narrow layout puts this same text inside a native select. */
  label: string;
  /**
   * A simple, single-colour icon, and nothing else.
   *
   * Never a rendered artifact, a live preview of the panel's content, or an image of an authored asset.
   * Four editors had drifted into using the tab as a second proof, and each read as clever alone and as noise in a row of tabs.
   * The rail beside an editor is where a proof belongs (Norbert, 2026-08-20).
   *
   * In practice: a lucide component, or a `TopicIcon` for a chapter concept that recurs across editors.
   * Both draw in `currentColor`, and `identity`, `about` and `contents` are already mapped.
   * The rule is "A tab icon is an icon, never a proof" in docs/technical/ui-design-decisions.md.
   */
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
}

/**
 * The single outline that joins the selected tab to the panel, as one `d` string.
 * Kept private: it is the shape of this component's own render, not a geometry anyone else asks for.
 */
function buildConnectedTabsPath({
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

function useConnectedTabsGeometry({
  value,
  rootRef,
  panelRef,
}: {
  value: string;
  rootRef: React.RefObject<HTMLDivElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [geometry, setGeometry] = useState<GlassOutlineGeometry | null>(null);

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
}: ConnectedTabsProps<Value>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const geometry = useConnectedTabsGeometry({ value, rootRef, panelRef });
  const activeItem = items.find((item) => item.value === value);
  const hasMultipleEnabledItems = items.filter((item) => !item.disabled).length > 1;
  const selectAdjacent = (direction: -1 | 1) => onValueChange(findAdjacentEnabledValue({ value, items, direction }));

  return (
    <div className={clsx(styles.host, className)}>
      <Tabs.Root
        ref={rootRef}
        className={styles.root}
        value={value}
        onValueChange={(nextValue) => onValueChange(nextValue as Value)}
        orientation="vertical"
        activationMode="automatic"
      >
        <div className={styles.surfaceLayer} aria-hidden>
          <GlassOutline geometry={geometry} />
        </div>
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
        <div ref={panelRef} className={styles.panelShell}>
          {items.map((item) => (
            <Tabs.Content className={styles.panel} key={item.value} value={item.value}>
              {/* The SVG glass paints this panel as a pane, so the nesting guard
                  must see panel content as already inside a surface. */}
              <PaintedSurfaceBoundary>{item.panel}</PaintedSurfaceBoundary>
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>
    </div>
  );
}
