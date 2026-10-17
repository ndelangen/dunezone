import { Button, FileButton, Group, Popover, Slider, Stack, Switch, Text } from '@mantine/core';
import { CENTER } from '@shared/boards/geometry';
import type { Point } from '@shared/boards/geometry';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { ImagePlus } from 'lucide-react';
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
    resize: (factor: number) =>
      setTracing((current) =>
        current
          ? {
              ...current,
              scale: Math.max(TRACING_SCALE.min, Math.min(TRACING_SCALE.max, current.scale * factor)),
            }
          : current
      ),
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

export function TracingImageControls({
  controls,
  onMove,
}: {
  controls: ReturnType<typeof useTracingImage>;
  onMove: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const { tracing, error, pick, patch, remove } = controls;
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
          <Text size="sm">
            Pick a picture of a map to trace over. It is a drawing guide only: it stays on this device, is never
            uploaded or saved, and is not part of your board.
          </Text>
          <FileButton onChange={pick} accept="image/*">
            {(props) => (
              <Button {...props} variant="default">
                {tracing ? 'Replace image…' : 'Choose image…'}
              </Button>
            )}
          </FileButton>
          {error && (
            <Text size="sm" c="red">
              {error}
            </Text>
          )}
          {tracing && (
            <>
              <Text size="xs" c="dimmed" truncate>
                {tracing.name}
              </Text>
              <Switch
                label="Show tracing image"
                checked={tracing.visible}
                onChange={(event) => patch({ visible: event.currentTarget.checked })}
              />
              <ControlBlock
                title="Opacity"
                tool={<Text size="xs">{Math.round(tracing.opacity * 100)}%</Text>}
                input={
                  <Slider
                    thumbLabel="Tracing image opacity"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={tracing.opacity}
                    onChange={(opacity) => patch({ opacity })}
                  />
                }
              />
              <ControlBlock
                title="Size"
                tool={<Text size="xs">{Math.round(tracing.scale * 100)}%</Text>}
                input={
                  <Slider
                    thumbLabel="Tracing image size"
                    min={TRACING_SCALE.min}
                    max={TRACING_SCALE.max}
                    step={0.01}
                    value={tracing.scale}
                    onChange={(scale) => patch({ scale })}
                  />
                }
              />
              <Text size="xs" c="dimmed">
                With the move tool, drag the image to place it and scroll to resize it.
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => {
                    patch({ visible: true });
                    onMove();
                    setOpened(false);
                  }}
                >
                  Move image
                </Button>
                <Button size="xs" variant="default" onClick={() => patch({ center: [...CENTER], scale: 1 })}>
                  Reset
                </Button>
                <Button size="xs" variant="default" onClick={remove}>
                  Remove
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
