import { Button, FileButton, Group, Popover, Slider, Stack, Text } from '@mantine/core';
import { CENTER } from '@shared/boards/geometry';
import type { Point } from '@shared/boards/geometry';
import { FormError } from '@ui/block/FormError';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { useDismissToolbarOverflow } from '@ui/surface/Toolbar';
import { Eye, EyeOff, ImagePlus, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { overflowMenuButton } from '@app/widgets/authoring/LoadExisting';

const BOARD_SIZE = 487.06;
const TRACING_SCALE = { min: 0.1, max: 4 } as const;

/**
 * A picture the author traces over while drawing territories.
 * It lives only in this editor's memory as an object URL: it is never uploaded, saved, undone or drawn into the board's artwork.
 */
export type TracingImage = {
  url: string;
  name: string;
  width: number;
  height: number;
  /** How far the image's centre sits from the board's centre, in board units; 0,0 is centred. */
  offset: Point;
  /** 1 fits the whole image inside the board's square. */
  scale: number;
  opacity: number;
  visible: boolean;
};

function readImage(file: File): Promise<TracingImage> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        url,
        name: file.name,
        width: image.naturalWidth || BOARD_SIZE,
        height: image.naturalHeight || BOARD_SIZE,
        offset: [0, 0],
        scale: 1,
        opacity: 0.5,
        visible: true,
      });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be opened as an image'));
    };
    image.src = url;
  });
}

/** Loads a picked file, keeping the result only while it is still the latest pick; a discarded image's URL is revoked. */
function loadLatest(
  file: File,
  id: number,
  latest: () => number,
  { onImage, onError }: { onImage: (image: TracingImage) => void; onError: (message: string) => void }
) {
  readImage(file).then(
    (image) => (id === latest() ? onImage(image) : URL.revokeObjectURL(image.url)),
    (reason: Error) => id === latest() && onError(reason.message)
  );
}

/**
 * Holds the tracing image and frees its object URL when it is replaced, removed or the editor closes.
 * Each pick is numbered, so a slow load that finishes after a newer pick, a removal or unmount is discarded and its URL revoked.
 */
export function useTracingImage() {
  const [tracing, setTracing] = useState<TracingImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = useRef<string | null>(null);
  const request = useRef(0);
  const input = useRef<() => void>(null);
  useEffect(
    () => () => {
      request.current += 1;
      if (url.current) {
        URL.revokeObjectURL(url.current);
      }
    },
    []
  );
  const replace = (next: TracingImage | null) => {
    if (url.current && url.current !== next?.url) {
      URL.revokeObjectURL(url.current);
    }
    url.current = next?.url ?? null;
    setTracing(next);
  };
  return {
    tracing,
    error,
    input,
    pick: (file: File | null) => {
      /* Clearing the input lets the same file be picked again after a removal. */
      input.current?.();
      if (file) {
        setError(null);
        loadLatest(file, ++request.current, () => request.current, { onImage: replace, onError: setError });
      }
    },
    patch: (patch: Partial<TracingImage>) => setTracing((current) => (current ? { ...current, ...patch } : current)),
    remove: () => {
      request.current += 1;
      replace(null);
    },
  };
}

function tracingBox(tracing: TracingImage) {
  const fit = (BOARD_SIZE / Math.max(tracing.width, tracing.height)) * tracing.scale;
  const width = tracing.width * fit,
    height = tracing.height * fit;
  return {
    x: CENTER[0] + tracing.offset[0] - width / 2,
    y: CENTER[1] + tracing.offset[1] - height / 2,
    width,
    height,
  };
}

/** The image itself, drawn inside the board's zoomed group; it never takes the pointer. */
export function TracingImageLayer({ tracing }: { tracing: TracingImage }) {
  return (
    <image
      href={tracing.url}
      {...tracingBox(tracing)}
      opacity={tracing.opacity}
      preserveAspectRatio="none"
      pointerEvents="none"
      data-tracing-image
    />
  );
}

/** Show, reset and remove, beside the picked image's name. */
function TracingImageActions({
  tracing,
  patch,
  remove,
}: { tracing: TracingImage } & Pick<ReturnType<typeof useTracingImage>, 'patch' | 'remove'>) {
  return (
    <Group gap="xs" wrap="nowrap">
      <IconAction
        label={tracing.visible ? 'Hide tracing image' : 'Show tracing image'}
        icon={tracing.visible ? <Eye size={17} /> : <EyeOff size={17} />}
        emphasis="standard"
        pressed={tracing.visible}
        onClick={() => patch({ visible: !tracing.visible })}
      />
      <IconAction
        label="Reset tracing image size and position"
        icon={<RotateCcw size={17} />}
        emphasis="standard"
        onClick={() => patch({ offset: [0, 0], scale: 1 })}
      />
      <IconAction label="Remove tracing image" icon={<X size={17} />} emphasis="standard" onClick={remove} />
    </Group>
  );
}

/**
 * The trigger for the tracing image panel, placed among the toolbar's map settings.
 * When those settings have folded into More actions, it closes that menu first, so only one floating pane is ever open.
 */
export function TracingImageTrigger({ pressed, onToggle }: { pressed: boolean; onToggle: () => void }) {
  const dismissOverflow = useDismissToolbarOverflow();
  return (
    <span data-tracing-trigger>
      <IconAction
        label="Tracing image"
        icon={<ImagePlus size={17} />}
        emphasis="standard"
        pressed={pressed}
        onClick={() => {
          dismissOverflow?.();
          onToggle();
        }}
      />
    </span>
  );
}

/** Where focus goes when the panel closes: its trigger, or More actions when the trigger lived in the now-closed overflow menu. */
function focusTrigger(toolbar: HTMLElement | null) {
  const trigger = toolbar?.querySelector<HTMLButtonElement>('[data-tracing-trigger] button');
  (trigger ?? overflowMenuButton(toolbar))?.focus();
}

/** Whether a click landed on a toolbar button other than the tracing image trigger. */
function isOtherToolbarButton(target: EventTarget) {
  const button = target instanceof Element ? target.closest('button') : null;
  return button != null && !button.closest('[data-tracing-trigger]');
}

/** Opacity, size and position, each a slider; 0,0 centres the image on the board. */
function TracingImageSliders({
  tracing,
  patch,
}: { tracing: TracingImage } & Pick<ReturnType<typeof useTracingImage>, 'patch'>) {
  const [x, y] = tracing.offset;
  const sliders = [
    [
      'Opacity',
      0.1,
      1,
      0.05,
      tracing.opacity,
      `${Math.round(tracing.opacity * 100)}%`,
      (opacity: number) => patch({ opacity }),
    ],
    [
      'Size',
      TRACING_SCALE.min,
      TRACING_SCALE.max,
      0.01,
      tracing.scale,
      `${Math.round(tracing.scale * 100)}%`,
      (scale: number) => patch({ scale }),
    ],
    ['X', -BOARD_SIZE, BOARD_SIZE, 0.5, x, x.toFixed(1), (next: number) => patch({ offset: [next, y] })],
    ['Y', -BOARD_SIZE, BOARD_SIZE, 0.5, y, y.toFixed(1), (next: number) => patch({ offset: [x, next] })],
  ] as const;
  return sliders.map(([title, min, max, step, value, shown, onChange]) => (
    <ControlBlock
      key={title}
      title={title}
      tool={<Text size="xs">{shown}</Text>}
      input={
        <Slider
          thumbLabel={`Tracing image ${title.toLowerCase()}`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={onChange}
        />
      }
    />
  ));
}

/**
 * The tracing image panel, anchored to the whole toolbar rather than its trigger, like LoadExisting.
 * The trigger may live in the toolbar's overflow menu, and the panel must not open inside that menu's pane.
 */
export function TracingImagePanel({
  controls,
  opened,
  onChange,
  children,
}: {
  controls: ReturnType<typeof useTracingImage>;
  opened: boolean;
  onChange: (opened: boolean) => void;
  children: ReactNode;
}) {
  const { tracing, error, input, pick, patch, remove } = controls;
  const toolbar = useRef<HTMLDivElement>(null);
  return (
    <Popover
      opened={opened}
      onChange={(next) => {
        onChange(next);
        if (!next) {
          requestAnimationFrame(() => focusTrigger(toolbar.current));
        }
      }}
      position="bottom-end"
      width={320}
      shadow="md"
      withArrow
      withRoles={false}
      trapFocus
      returnFocus={false}
    >
      <Popover.Target>
        <div
          ref={toolbar}
          onClickCapture={(event) => {
            /* Any other toolbar button closes the panel, so two of the toolbar's layers are never open at once. */
            if (isOtherToolbarButton(event.target)) {
              onChange(false);
            }
          }}
        >
          {children}
        </div>
      </Popover.Target>
      <Popover.Dropdown role="dialog" aria-label="Tracing image">
        <Stack gap="sm">
          <ControlBlock
            title={tracing ? tracing.name : 'Tracing image'}
            description={
              'A picture to trace over while you draw.\nIt stays on this device and is never saved with your board.'
            }
            tool={tracing && <TracingImageActions tracing={tracing} patch={patch} remove={remove} />}
            input={
              <Stack gap={4}>
                <FileButton onChange={pick} accept="image/*" resetRef={input}>
                  {(props) => (
                    <Button {...props} variant="default">
                      {tracing ? 'Replace image…' : 'Choose image…'}
                    </Button>
                  )}
                </FileButton>
                {error && <FormError title="Image could not be opened">{error}</FormError>}
              </Stack>
            }
          />
          {tracing && <TracingImageSliders tracing={tracing} patch={patch} />}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
