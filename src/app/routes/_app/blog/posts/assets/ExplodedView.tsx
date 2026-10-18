import { Slider, Stack, Text, UnstyledButton } from '@mantine/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { WideFigure } from '../../postContent';
import styles from './ExplodedView.module.css';
import { useScrollDriven } from './scrollDriven';

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
  /** The layer the pointer is over, which wins over a picked one while it lasts. */
  hovered: number | null;
  /** The layer the reader tapped or clicked, until they tap it again. */
  picked: number | null;
}>;

type Event =
  | { type: 'scrolled'; apart: number }
  | { type: 'slid'; apart: number }
  | { type: 'hovered'; index: number | null }
  | { type: 'picked'; index: number };

/* The stage's widest size, `max-width` in the stylesheet, and the share of it the object fills. */
const STAGE_MAX_WIDTH = 544;
const FILL = 0.62;

function reduce(state: State, event: Event): State {
  switch (event.type) {
    case 'scrolled':
      return state.readerHolds || Math.abs(event.apart - state.apart) < 0.001
        ? state
        : { ...state, apart: event.apart };
    case 'slid':
      return { ...state, apart: event.apart, readerHolds: true };
    case 'hovered':
      return { ...state, hovered: event.index };
    case 'picked':
      /* Picking a layer in a closed stack opens it, since a closed stack shows the whole object over its layers. */
      return state.picked === event.index
        ? { ...state, picked: null }
        : { ...state, picked: event.index, apart: Math.max(state.apart, 1), readerHolds: true };
  }
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
  const [state, dispatch] = useReducer(reduce, { apart: 0, readerHolds: false, hovered: null, picked: null });
  const stage = useRef<HTMLDivElement>(null);
  const focused = state.hovered ?? state.picked;

  useScrollDriven(stage, (apart) => dispatch({ type: 'scrolled', apart }));

  /* The stage's width is read from the page, so this subscribes to it. */
  useEffect(() => {
    const element = stage.current!;
    const fit = () =>
      element.style.setProperty('--fit', String((element.clientWidth * FILL) / Math.max(width, height)));
    const resize = new ResizeObserver(fit);
    resize.observe(element);
    fit();
    return () => resize.disconnect();
  }, [width, height]);

  /* The planes keep their element identity while the layers move, so scrolling repaints transforms and never re-renders a renderer. */
  const planes = useMemo(
    () =>
      layers.map((layer, index) => (
        <div
          key={layer.title}
          className={styles.plane}
          style={{ '--index': index - (layers.length - 1) / 2 } as CSSProperties}
          data-dimmed={focused !== null && focused !== index ? true : undefined}
        >
          <div className={styles.sheet} />
          <div className={styles.content}>{layer.content}</div>
        </div>
      )),
    [layers, focused]
  );

  return (
    <WideFigure caption={caption}>
      <div className={styles.layout}>
        <div className={styles.columns}>
          <div
            ref={stage}
            className={styles.stage}
            data-shape={shape}
            style={
              {
                '--apart': state.apart,
                /* The fit for the widest stage, so the first paint, before scripts measure the stage, is already in proportion. */
                '--fit': (STAGE_MAX_WIDTH * FILL) / Math.max(width, height),
                '--natural-width': `${width}px`,
                '--layers': layers.length,
                '--natural-height': `${height}px`,
              } as CSSProperties
            }
          >
            <div className={styles.scene} aria-hidden>
              {planes}
            </div>
            <div className={styles.whole}>
              <div className={styles.content}>{whole}</div>
            </div>
          </div>
          <Stack gap="sm" className={styles.controls}>
            <Stack gap="xs">
              <Text size="sm" c="dimmed" aria-hidden>
                Separate the layers
              </Text>
              <Slider
                thumbLabel="Separate the layers"
                min={0}
                max={100}
                value={Math.round(state.apart * 100)}
                onChange={(percent) => dispatch({ type: 'slid', apart: percent / 100 })}
                label={(percent) => `${percent}%`}
                thumbValueText={(percent) => `${percent}%`}
              />
            </Stack>
            <ol className={styles.legend}>
              {layers.map((layer, index) => (
                <li key={layer.title}>
                  <UnstyledButton
                    className={styles.layerButton}
                    aria-pressed={state.picked === index}
                    onClick={() => dispatch({ type: 'picked', index })}
                    onMouseEnter={() => dispatch({ type: 'hovered', index })}
                    onMouseLeave={() => dispatch({ type: 'hovered', index: null })}
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
      </div>
    </WideFigure>
  );
}
