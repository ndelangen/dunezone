import { Alert, Button, ColorInput, Group, NumberInput, Select, Slider, Stack, Text } from '@mantine/core';
import { CUSTOM_CARD_MAX_LAYERS, CUSTOM_CARD_MAX_TEXT_LENGTH, RECTANGLE_TOKEN_FONTS } from '@shared/assets/schema';
import type { CustomCardTokens } from '@shared/assets/schema';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { DecalControls } from '@app/widgets/decal-editor/DecalControls';
import { card } from '@game/data/sizes';

import type { CustomCardChapter } from './CustomCardEditor';
import { newCardDecal, newCardText, newCardToken } from './customCardPresets';
import type { CardLayer, CustomCardDraft } from './customCardPresets';

export type CardTokenPicker = (onPick: (id: string) => void, onCancel: () => void) => ReactNode;
type TokenContext = { tokens: z.infer<typeof CustomCardTokens>; tokenPicker: CardTokenPicker };

type Patch = (update: Partial<CustomCardDraft>) => void;

function TextLayerFields({
  layer,
  label,
  onChange,
}: {
  layer: Extract<CardLayer, { kind: 'text' }>;
  label: string;
  onChange: (layer: CardLayer) => void;
}) {
  return (
    <>
      <ControlBlock
        title="Text"
        input={
          <FormattedTextInput
            aria-label={`Text for ${label}`}
            maxLength={CUSTOM_CARD_MAX_TEXT_LENGTH}
            value={layer.content}
            onChange={(content) => onChange({ ...layer, content })}
          />
        }
      />
      <Select
        label="Font"
        aria-label={`Font for ${label}`}
        allowDeselect={false}
        data={RECTANGLE_TOKEN_FONTS.map((font) => ({
          value: font,
          label: font.replace(/^C_/, '').replace(/_/g, ' '),
        }))}
        value={layer.font}
        onChange={(font) => {
          if (font) {
            onChange({ ...layer, font: font as typeof layer.font });
          }
        }}
        renderOption={({ option }) => (
          <span style={{ fontFamily: `"${option.value}", sans-serif` }}>{option.label}</span>
        )}
      />
      <Group grow>
        <NumberInput
          label="Text size"
          aria-label={`Text size for ${label}`}
          value={layer.size}
          min={1}
          max={200}
          onChange={(size) => {
            if (typeof size === 'number') {
              onChange({ ...layer, size });
            }
          }}
        />
        <Select
          label="Alignment"
          aria-label={`Alignment for ${label}`}
          value={layer.align}
          allowDeselect={false}
          data={['left', 'center', 'right']}
          onChange={(align) => {
            if (align) {
              onChange({ ...layer, align: align as typeof layer.align });
            }
          }}
        />
      </Group>
      <Group grow>
        <NumberInput
          label="Width"
          aria-label={`Width for ${label}`}
          value={layer.width}
          min={1}
          max={900}
          onChange={(width) => {
            if (typeof width === 'number') {
              onChange({ ...layer, width });
            }
          }}
        />
        <NumberInput
          label="Height"
          aria-label={`Height for ${label}`}
          value={layer.height}
          min={1}
          max={1263}
          onChange={(height) => {
            if (typeof height === 'number') {
              onChange({ ...layer, height });
            }
          }}
        />
      </Group>
      <ColorInput
        label="Text color"
        aria-label={`Text color for ${label}`}
        format="hex"
        value={layer.color}
        onChangeEnd={(color) => {
          if (/^#[0-9a-fA-F]{6}$/.test(color)) {
            onChange({ ...layer, color });
          }
        }}
      />
    </>
  );
}

function TokenLayerFields({
  layer,
  tokens,
  tokenPicker,
  onChange,
}: TokenContext & {
  layer: Extract<CardLayer, { kind: 'token' }>;
  onChange: (layer: CardLayer) => void;
}) {
  const [picking, setPicking] = useState(false);
  const token = tokens[layer.asset_id];
  return (
    <Stack gap="sm">
      <Text size="sm">
        {token?.name ?? (token === null ? 'This token is unavailable.' : 'Loading linked token...')}
      </Text>
      <Text size="sm" c="dimmed">
        The front stays linked to the original token. Editing that token updates this card.
      </Text>
      <Button variant="default" onClick={() => setPicking(true)}>
        Replace token
      </Button>
      {picking
        ? tokenPicker(
            (asset_id) => {
              onChange({ ...layer, asset_id });
              setPicking(false);
            },
            () => setPicking(false)
          )
        : null}
      <ControlBlock
        title="Token scale"
        tool={
          <NumberInput
            aria-label="Token scale"
            w={110}
            min={0.05}
            max={3}
            step={0.05}
            value={layer.scale}
            onChange={(scale) => {
              if (typeof scale === 'number') {
                onChange({ ...layer, scale });
              }
            }}
          />
        }
        input={
          <Slider
            aria-label="Token scale slider"
            thumbLabel="Token scale"
            min={0.05}
            max={3}
            step={0.05}
            value={layer.scale}
            onChange={(scale) => onChange({ ...layer, scale })}
          />
        }
      />
    </Stack>
  );
}

function LayerFields({
  layer,
  index,
  format,
  onChange,
  tokens,
  tokenPicker,
}: TokenContext & {
  layer: CardLayer;
  index: number;
  format: CustomCardDraft['format'];
  onChange: (layer: CardLayer) => void;
}) {
  const label = `Layer ${index + 1}`;
  return (
    <Stack gap="md">
      {layer.kind === 'decal' ? (
        <DecalControls
          value={layer}
          label={label.toLowerCase()}
          offsetRange={[450, 631.5]}
          placement={<LayerPlacement layer={layer} format={format} onChange={onChange} />}
          onChange={(decal) => onChange({ ...layer, ...decal })}
        />
      ) : layer.kind === 'token' ? (
        <TokenLayerFields layer={layer} tokens={tokens} tokenPicker={tokenPicker} onChange={onChange} />
      ) : (
        <>
          <TextLayerFields layer={layer} label={label.toLowerCase()} onChange={onChange} />
        </>
      )}
      {layer.kind !== 'decal' ? <LayerPlacement layer={layer} format={format} onChange={onChange} /> : null}
      {(
        [
          { key: 'opacity', title: 'Opacity', min: 0, max: 1, step: 0.05 },
          { key: 'rotation', title: 'Rotation', min: -360, max: 360, step: 1 },
        ] as const
      ).map(({ key, title, min, max, step }) => (
        <ControlBlock
          key={key}
          title={title}
          tool={
            <NumberInput
              aria-label={`${title} for ${label.toLowerCase()}`}
              w={110}
              value={layer[key]}
              min={min}
              max={max}
              step={step}
              onChange={(value) => {
                if (typeof value === 'number') {
                  onChange({ ...layer, [key]: value });
                }
              }}
            />
          }
          input={
            <Slider
              aria-label={`${title} slider for ${label.toLowerCase()}`}
              thumbLabel={`${title} for ${label.toLowerCase()}`}
              value={layer[key]}
              min={min}
              max={max}
              step={step}
              onChange={(value) => onChange({ ...layer, [key]: value })}
            />
          }
        />
      ))}
    </Stack>
  );
}

function LayerPlacement({
  layer,
  format,
  onChange,
}: {
  layer: CardLayer;
  format: CustomCardDraft['format'];
  onChange: (layer: CardLayer) => void;
}) {
  const origin = [card.width / 2, card.height / 2];
  const isText = layer.kind === 'text';
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {isText
          ? "Place the text box's top-left corner, measured from the card's top-left corner."
          : `Place the ${layer.kind === 'token' ? 'token' : 'decal'}'s centre, measured from the card's top-left corner.`}
      </Text>
      {(['Horizontal', 'Vertical'] as const).map((axis, index) => {
        const value = layer.offset[index] + origin[index];
        const max = index === 0 ? card.width : card.height;
        const change = (next: number) => {
          const offset: [number, number] = [...layer.offset];
          offset[index] = next - origin[index];
          onChange({ ...layer, offset });
        };
        return (
          <ControlBlock
            key={axis}
            title={`${axis} position`}
            tool={
              <NumberInput
                aria-label={`${axis} position`}
                w={110}
                value={value}
                step={1}
                onChange={(next) => {
                  if (typeof next === 'number') {
                    change(next);
                  }
                }}
              />
            }
            input={
              <Slider
                aria-label={`${axis} position slider`}
                thumbLabel={`${axis} position`}
                min={0}
                max={max}
                step={1}
                value={value}
                onChange={change}
              />
            }
          />
        );
      })}
      <Group gap="xs">
        <Button
          variant="default"
          size="xs"
          onClick={() => onChange({ ...layer, offset: [isText ? -layer.width / 2 : 0, layer.offset[1]] })}
        >
          Centre horizontally
        </Button>
        <Button
          variant="default"
          size="xs"
          onClick={() => onChange({ ...layer, offset: [layer.offset[0], isText ? -layer.height / 2 : 0] })}
        >
          Centre vertically
        </Button>
        {isText ? (
          <Button
            variant="default"
            size="xs"
            onClick={() => {
              const body = newCardText(format);
              onChange({ ...layer, offset: body.offset, width: body.width, height: body.height });
            }}
          >
            Fit box to text body
          </Button>
        ) : format === 'decal-window' ? (
          <Button variant="default" size="xs" onClick={() => onChange({ ...layer, offset: [0, -161.5] })}>
            {layer.kind === 'token' ? 'Centre in window' : 'Centre in decal window'}
          </Button>
        ) : null}
      </Group>
    </Stack>
  );
}

export function CustomCardLayerPanel({
  draft,
  patch,
  index,
  onChapterChange,
  tokens,
  tokenPicker,
}: TokenContext & {
  draft: CustomCardDraft;
  patch: Patch;
  index: number;
  onChapterChange: (chapter: CustomCardChapter) => void;
}) {
  const layer = draft.layers[index];
  const move = (step: number) => {
    const layers = [...draft.layers];
    const target = index + step;
    if (target < 0 || target >= layers.length) {
      return;
    }
    [layers[index], layers[target]] = [layers[target]!, layers[index]!];
    patch({ layers });
  };
  return (
    <Stack gap="lg">
      <Group gap="xs">
        <Button size="xs" variant="default" disabled={index === 0} onClick={() => move(-1)}>
          Move backward
        </Button>
        <Button size="xs" variant="default" disabled={index === draft.layers.length - 1} onClick={() => move(1)}>
          Move forward
        </Button>
        <Button
          size="xs"
          variant="default"
          disabled={draft.layers.length >= CUSTOM_CARD_MAX_LAYERS}
          onClick={() => {
            const duplicate = { ...structuredClone(layer), layerId: crypto.randomUUID() };
            patch({ layers: [...draft.layers.slice(0, index + 1), duplicate, ...draft.layers.slice(index + 1)] });
            onChapterChange(`layer:${duplicate.layerId}`);
          }}
        >
          Duplicate layer
        </Button>
        <ConfirmDeleteAction
          label="Remove layer"
          verb="remove"
          size="sm"
          pending={false}
          onConfirm={() => {
            patch({ layers: draft.layers.filter((current) => current.layerId !== layer.layerId) });
            onChapterChange('layers');
          }}
        />
      </Group>
      <LayerFields
        tokens={tokens}
        tokenPicker={tokenPicker}
        layer={layer}
        index={index}
        format={draft.format}
        onChange={(next) =>
          patch({ layers: draft.layers.map((current) => (current.layerId === layer.layerId ? next : current)) })
        }
      />
    </Stack>
  );
}

export function CustomCardLayers({
  draft,
  patch,
  onChapterChange,
  tokenPicker,
}: {
  tokenPicker: CardTokenPicker;
  draft: CustomCardDraft;
  patch: Patch;
  onChapterChange: (chapter: CustomCardChapter) => void;
}) {
  const [picking, setPicking] = useState(false);
  const add = (layer: CardLayer) => {
    patch({ layers: [...draft.layers, layer] });
    onChapterChange(`layer:${layer.layerId}`);
  };
  return (
    <Stack gap="md">
      <Group>
        <Button
          variant="default"
          disabled={draft.layers.length >= CUSTOM_CARD_MAX_LAYERS}
          onClick={() => add(newCardDecal())}
        >
          Add decal
        </Button>
        <Button
          variant="default"
          disabled={draft.layers.length >= CUSTOM_CARD_MAX_LAYERS}
          onClick={() => add(newCardText(draft.format))}
        >
          Add text
        </Button>
        <Button
          variant="default"
          disabled={draft.layers.length >= CUSTOM_CARD_MAX_LAYERS}
          onClick={() => setPicking(true)}
        >
          Add token
        </Button>
      </Group>
      {picking
        ? tokenPicker(
            (id) => {
              add(newCardToken(id));
              setPicking(false);
            },
            () => setPicking(false)
          )
        : null}
      <Text size="sm" c="dimmed">
        {draft.layers.length} of {CUSTOM_CARD_MAX_LAYERS} layers
      </Text>
      <Text size="sm" c="dimmed">
        Each layer has its own tab. Later layers sit above earlier layers. The Head stays above them all.
      </Text>
      {draft.layers.length === 0 ? (
        <Alert title="No layers" color="gray">
          Add decals and text, or choose a starting preset in Format.
        </Alert>
      ) : null}
      {draft.layers.map((layer, index) => (
        <Button
          key={layer.layerId}
          variant="subtle"
          justify="start"
          onClick={() => onChapterChange(`layer:${layer.layerId}`)}
        >
          {index + 1}. {layer.kind === 'decal' ? 'Decal' : layer.kind === 'token' ? 'Token' : 'Text'}
        </Button>
      ))}
    </Stack>
  );
}
