import { Button, FileButton, Group, Popover, Slider, Stack, Text } from '@mantine/core';
import { CENTER } from '@shared/boards/geometry';
import type { Point } from '@shared/boards/geometry';
import { FormError } from '@ui/block/FormError';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { Eye, EyeOff, ImagePlus, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
  /** The image's centre in board coordinates. */
  center: Point;
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
        center: [...CENTER],
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

/** Holds the tracing image and frees its object URL when it is replaced, removed or the editor closes. */
export function useTracingImage() {
  const [tracing, setTracing] = useState<TracingImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = useRef<string | null>(null);
  useEffect(() => () => void (url.current && URL.revokeObjectURL(url.current)), []);
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
    pick: (file: File | null) => {
      if (!file) {
        return;
      }
      setError(null);
      readImage(file).then(replace, (reason: Error) => setError(reason.message));
    },
    patch: (patch: Partial<TracingImage>) => setTracing((current) => (current ? { ...current, ...patch } : current)),
    remove: () => replace(null),
  };
}

function tracingBox(tracing: TracingImage) {
  const fit = (BOARD_SIZE / Math.max(tracing.width, tracing.height)) * tracing.scale;
  const width = tracing.width * fit,
    height = tracing.height * fit;
  return { x: tracing.center[0] - width / 2, y: tracing.center[1] - height / 2, width, height };
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

export function TracingImageControls({ controls }: { controls: ReturnType<typeof useTracingImage> }) {
  const [opened, setOpened] = useState(false);
  const { tracing, error, pick, patch, remove } = controls;
  const sliders = tracing
    ? ([
        [
          'Opacity',
          'Tracing image opacity',
          0.1,
          1,
          0.05,
          tracing.opacity,
          `${Math.round(tracing.opacity * 100)}%`,
          (opacity: number) => patch({ opacity }),
        ],
        [
          'Size',
          'Tracing image size',
          TRACING_SCALE.min,
          TRACING_SCALE.max,
          0.01,
          tracing.scale,
          `${Math.round(tracing.scale * 100)}%`,
          (scale: number) => patch({ scale }),
        ],
        [
          'X',
          'Tracing image x',
          -BOARD_SIZE / 2,
          BOARD_SIZE * 1.5,
          0.5,
          tracing.center[0],
          tracing.center[0].toFixed(1),
          (x: number) => patch({ center: [x, tracing.center[1]] }),
        ],
        [
          'Y',
          'Tracing image y',
          -BOARD_SIZE / 2,
          BOARD_SIZE * 1.5,
          0.5,
          tracing.center[1],
          tracing.center[1].toFixed(1),
          (y: number) => patch({ center: [tracing.center[0], y] }),
        ],
      ] as const)
    : [];
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width={320}
      shadow="md"
      withArrow
      withRoles={false}
      trapFocus
    >
      <Popover.Target>
        <div>
          <IconAction
            label="Tracing image"
            icon={<ImagePlus size={17} />}
            emphasis="standard"
            pressed={Boolean(tracing?.visible)}
            onClick={() => setOpened((was) => !was)}
          />
        </div>
      </Popover.Target>
      <Popover.Dropdown role="dialog" aria-label="Tracing image">
        <Stack gap="sm">
          <ControlBlock
            title={tracing ? tracing.name : 'Tracing image'}
            description="A picture to trace over while you draw. It stays on this device, is never uploaded or saved, and is not part of your board."
            tool={
              tracing && (
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
                    onClick={() => patch({ center: [...CENTER], scale: 1 })}
                  />
                  <IconAction
                    label="Remove tracing image"
                    icon={<X size={17} />}
                    emphasis="standard"
                    onClick={remove}
                  />
                </Group>
              )
            }
            input={
              <Stack gap={4}>
                <FileButton onChange={pick} accept="image/*">
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
          {sliders.map(([title, thumbLabel, min, max, step, value, shown, onChange]) => (
            <ControlBlock
              key={title}
              title={title}
              tool={<Text size="xs">{shown}</Text>}
              input={
                <Slider thumbLabel={thumbLabel} min={min} max={max} step={step} value={value} onChange={onChange} />
              }
            />
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
