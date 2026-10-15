import { Slider, Stack, Text, UnstyledButton } from '@mantine/core';
import { useEffect, useId, useMemo, useReducer, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import styles from './ExplodedView.module.css';

export type ExplodedLayer = Readonly<{
  title: string;
  description: string;
  /** The whole renderer, drawn at its natural size, trimmed to this one layer. */
  content: ReactNode;
}>;

type State = Readonly<{
  /** 0 is the assembled object, 1 is every layer apart. */
  apart: number;
  /** Once the reader moves the slider, scrolling stops moving the layers. */
  readerHolds: boolean;
  focused: number | null;
}>;

type Event =
  | { type: 'scrolled'; apart: number }
  | { type: 'slid'; apart: number }
  | { type: 'focused'; index: number | null };

function reduce(state: State, event: Event): State {
  switch (event.type) {
    case 'scrolled':
      return state.readerHolds ? state : { ...state, apart: event.apart };
    case 'slid':
      return { ...state, apart: event.apart, readerHolds: true };
    case 'focused':
      return { ...state, focused: event.index };
  }
}

/*
 * How far apart the layers are for a figure at `progress` through the viewport, 0 entering at the bottom and 1 leaving at the top.
 * The layers separate while the figure rises to the middle of the screen, stay apart there, and close again as it leaves.
 */
function apartAt(progress: number): number {
  const rise = (progress - 0.15) / 0.3;
  const fall = (0.95 - progress) / 0.2;
  const linear = Math.min(1, Math.max(0, Math.min(rise, fall)));
  return linear * linear * (3 - 2 * linear);
}

/**
 * A renderer pulled apart into a stack of its layers, bottom to top in paint order.
 * The layers separate as the reader scrolls past, and the slider hands that control to the reader.
 */
export function ExplodedView({
  layers,
  width,
  height,
  shape,
  whole,
  caption,
}: Readonly<{
  layers: readonly ExplodedLayer[];
  /** The renderer's natural size in CSS pixels; every plane is drawn at that size and scaled to fit the stage. */
  width: number;
  height: number;
  /** The outline of the faint sheet drawn behind each plane. */
  shape: 'disc' | 'card';
  /**
   * The renderer drawn whole, shown while the stack is closed.
   * Separate planes cannot reproduce a blend mode that mixes one layer into the layers below it, so the closed object is the real one.
   */
  whole: ReactNode;
  caption?: ReactNode;
}>) {
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const [state, dispatch] = useReducer(reduce, {
    apart: reducedMotion ? 1 : 0,
    readerHolds: reducedMotion,
    focused: null,
  });
  const stage = useRef<HTMLDivElement>(null);
  const sliderLabel = useId();

  /* Scroll position and stage width are read from the page, so this subscribes to both. */
  useEffect(() => {
    const element = stage.current!;
    const fit = () => element.style.setProperty('--fit', String((element.clientWidth * 0.62) / Math.max(width, height)));
    const scrolled = () => {
      const { top, height: tall } = element.getBoundingClientRect();
      const progress = (window.innerHeight - top) / (window.innerHeight + tall);
      dispatch({ type: 'scrolled', apart: apartAt(progress) });
    };
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scrolled);
    };
    const resize = new ResizeObserver(fit);
    resize.observe(element);
    fit();
    scrolled();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [width, height]);

  /* The planes keep their element identity while the layers move, so scrolling repaints transforms and never re-renders a renderer. */
  const planes = useMemo(
    () =>
      layers.map((layer, index) => (
        <div
          key={layer.title}
          className={styles.plane}
          style={{ '--index': index - (layers.length - 1) / 2 } as CSSProperties}
          data-dimmed={state.focused !== null && state.focused !== index ? true : undefined}
        >
          <div className={styles.sheet} />
          <div className={styles.content}>{layer.content}</div>
        </div>
      )),
    [layers, state.focused]
  );

  return (
    <figure className={styles.figure}>
      <div className={styles.layout}>
        <div
          ref={stage}
          className={styles.stage}
          data-shape={shape}
          style={
            {
              '--apart': state.apart,
              '--natural-width': `${width}px`,
              '--natural-height': `${height}px`,
            } as CSSProperties
          }
        >
          <div className={styles.scene}>{planes}</div>
          <div className={styles.whole} aria-hidden={state.apart > 0.05}>
            <div className={styles.content}>{whole}</div>
          </div>
        </div>
        <Stack gap="sm" className={styles.controls}>
          <Stack gap={4}>
            <Text size="sm" c="dimmed" id={sliderLabel}>
              Separate the layers
            </Text>
            <Slider
              aria-labelledby={sliderLabel}
              min={0}
              max={1}
              step={0.01}
              value={state.apart}
              onChange={(apart) => dispatch({ type: 'slid', apart })}
              label={(value) => `${Math.round(value * 100)}%`}
            />
          </Stack>
          <ol className={styles.legend}>
            {layers.map((layer, index) => (
              <li key={layer.title}>
                <UnstyledButton
                  className={styles.layerButton}
                  onMouseEnter={() => dispatch({ type: 'focused', index })}
                  onMouseLeave={() => dispatch({ type: 'focused', index: null })}
                  onFocus={() => dispatch({ type: 'focused', index })}
                  onBlur={() => dispatch({ type: 'focused', index: null })}
                >
                  <span className={styles.number}>{index + 1}</span>
                  <span>
                    <Text span size="sm" fw={600} c="var(--mantine-color-text)" display="block">
                      {layer.title}
                    </Text>
                    <Text span size="xs" c="dimmed" display="block">
                      {layer.description}
                    </Text>
                  </span>
                </UnstyledButton>
              </li>
            ))}
          </ol>
        </Stack>
      </div>
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </figure>
  );
}
