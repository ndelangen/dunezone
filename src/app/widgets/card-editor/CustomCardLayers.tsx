import { ColorInput, Group, NumberInput, Select, Stack, Switch, Text } from '@mantine/core';
import { CUSTOM_CARD_MAX_LAYERS, CUSTOM_CARD_MAX_TEXT_LENGTH, RECTANGLE_TOKEN_FONTS } from '@shared/assets/schema';
import type { CustomCardTokens } from '@shared/assets/schema';
import { Notice } from '@ui/block/Notice';
import { HelpMark } from '@ui/content/HelpMark';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { RangeField } from '@ui/control/RangeField';
import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  BringToFront,
  Coins,
  Copy,
  Crosshair,
  Replace,
  ScanText,
  SendToBack,
  Sticker,
  Type,
} from 'lucide-react';
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

const LAYERS_FULL = `A card holds at most ${CUSTOM_CARD_MAX_LAYERS} layers.`;

const LAYER_NAME: Record<CardLayer['kind'], string> = { decal: 'Decal', token: 'Token', text: 'Text' };
const LAYER_ICON: Record<CardLayer['kind'], ReactNode> = {
  decal: <Sticker size={16} />,
  token: <Coins size={16} />,
  text: <Type size={16} />,
};

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
      <ControlBlock
        title="Font"
        input={
          <Select
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
        }
      />
      <Group grow>
        <ControlBlock
          title="Text size"
          input={
            <NumberInput
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
          }
        />
        <ControlBlock
          title="Alignment"
          input={
            <Select
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
          }
        />
      </Group>
      <Group grow>
        <ControlBlock
          title="Width"
          input={
            <NumberInput
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
          }
        />
        <ControlBlock
          title="Height"
          input={
            <NumberInput
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
          }
        />
      </Group>
      <ControlBlock
        title="Text color"
        input={
          <ColorInput
            aria-label={`Text color for ${label}`}
            format="hex"
            value={layer.color}
            onChangeEnd={(color) => {
              if (/^#[0-9a-fA-F]{6}$/.test(color)) {
                onChange({ ...layer, color });
              }
            }}
          />
        }
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
      <Group gap={4} wrap="nowrap">
        <Text size="sm">
          {token?.name ?? (token === null ? 'This token is unavailable.' : 'Loading linked token...')}
        </Text>
        <HelpMark text="The front stays linked to the original token. Editing that token updates this card." />
      </Group>
      <LabeledAction icon={<Replace size={16} />} onClick={() => setPicking(true)}>
        Replace token
      </LabeledAction>
      {picking
        ? tokenPicker(
            (asset_id) => {
              onChange({ ...layer, asset_id });
              setPicking(false);
            },
            () => setPicking(false)
          )
        : null}
      <RangeField
        title="Token scale"
        min={0.05}
        max={3}
        step={0.05}
        value={layer.scale}
        onChange={(scale) => onChange({ ...layer, scale })}
      />
    </Stack>
  );
}

function LayerFields({
  layer,
  index,
  format,
  windowOffsetY,
  onChange,
  tokens,
  tokenPicker,
}: TokenContext & {
  layer: CardLayer;
  index: number;
  format: CustomCardDraft['format'];
  windowOffsetY: number;
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
          placement={<LayerPlacement layer={layer} format={format} windowOffsetY={windowOffsetY} onChange={onChange} />}
          onChange={(decal) => onChange({ ...layer, ...decal })}
        />
      ) : layer.kind === 'token' ? (
        <TokenLayerFields layer={layer} tokens={tokens} tokenPicker={tokenPicker} onChange={onChange} />
      ) : (
        <>
          <TextLayerFields layer={layer} label={label.toLowerCase()} onChange={onChange} />
        </>
      )}
      {layer.kind === 'decal' ? (
        <ControlBlock
          title="Behind frame"
          description="Draw this decal under the frame, which hides artwork outside its window."
          input={(fieldProps) => (
            <Switch
              {...fieldProps}
              checked={layer.behindFrame ?? false}
              onChange={(event) => onChange({ ...layer, behindFrame: event.currentTarget.checked })}
            />
          )}
        />
      ) : null}
      {layer.kind !== 'decal' ? (
        <LayerPlacement layer={layer} format={format} windowOffsetY={windowOffsetY} onChange={onChange} />
      ) : null}
      {(
        [
          { key: 'opacity', title: 'Opacity', min: 0, max: 1, step: 0.05 },
          { key: 'rotation', title: 'Rotation', min: -360, max: 360, step: 1 },
        ] as const
      ).map(({ key, title, min, max, step }) => (
        <RangeField
          key={key}
          title={title}
          name={`${title} for ${label.toLowerCase()}`}
          min={min}
          max={max}
          step={step}
          value={layer[key]}
          onChange={(value) => onChange({ ...layer, [key]: value })}
        />
      ))}
    </Stack>
  );
}

function LayerPlacement({
  layer,
  format,
  windowOffsetY,
  onChange,
}: {
  layer: CardLayer;
  format: CustomCardDraft['format'];
  windowOffsetY: number;
  onChange: (layer: CardLayer) => void;
}) {
  const origin = [card.width / 2, card.height / 2];
  const isText = layer.kind === 'text';
  const placed = isText
    ? "the text box's top-left corner"
    : `the ${layer.kind === 'token' ? 'token' : 'decal'}'s centre`;
  return (
    <Stack gap="md">
      {(['Horizontal', 'Vertical'] as const).map((axis, index) => {
        const value = layer.offset[index] + origin[index];
        const max = index === 0 ? card.width : card.height;
        const change = (next: number) => {
          const offset: [number, number] = [...layer.offset];
          offset[index] = next - origin[index];
          onChange({ ...layer, offset });
        };
        return (
          <RangeField
            key={axis}
            title={`${axis} position`}
            description={`Where ${placed} sits, measured from the card's top-left corner.`}
            min={0}
            max={max}
            decimals={2}
            typedBeyondRange
            value={value}
            onChange={change}
          />
        );
      })}
      <Group gap="xs">
        <IconAction
          label="Centre horizontally"
          emphasis="standard"
          icon={<AlignHorizontalJustifyCenter size={16} aria-hidden />}
          onClick={() => onChange({ ...layer, offset: [isText ? -layer.width / 2 : 0, layer.offset[1]] })}
        />
        <IconAction
          label="Centre vertically"
          emphasis="standard"
          icon={<AlignVerticalJustifyCenter size={16} aria-hidden />}
          onClick={() => onChange({ ...layer, offset: [layer.offset[0], isText ? -layer.height / 2 : 0] })}
        />
        {isText ? (
          <IconAction
            label="Fit box to text body"
            emphasis="standard"
            icon={<ScanText size={16} aria-hidden />}
            onClick={() => {
              const body = newCardText(format, undefined, windowOffsetY);
              onChange({ ...layer, offset: body.offset, width: body.width, height: body.height });
            }}
          />
        ) : format === 'decal-window' ? (
          <IconAction
            label={layer.kind === 'token' ? 'Centre in window' : 'Centre in decal window'}
            emphasis="standard"
            icon={<Crosshair size={16} aria-hidden />}
            onClick={() => onChange({ ...layer, offset: [0, -161.5 + windowOffsetY] })}
          />
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
  const full = draft.layers.length >= CUSTOM_CARD_MAX_LAYERS;
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
        <IconAction
          label="Move backward"
          emphasis="standard"
          icon={<SendToBack size={16} aria-hidden />}
          disabledReason={index === 0 ? 'This layer is already at the back.' : undefined}
          onClick={() => move(-1)}
        />
        <IconAction
          label="Move forward"
          emphasis="standard"
          icon={<BringToFront size={16} aria-hidden />}
          disabledReason={index === draft.layers.length - 1 ? 'This layer is already at the front.' : undefined}
          onClick={() => move(1)}
        />
        <IconAction
          label="Duplicate layer"
          emphasis="standard"
          icon={<Copy size={16} aria-hidden />}
          disabledReason={full ? LAYERS_FULL : undefined}
          onClick={() => {
            const duplicate = { ...structuredClone(layer), layerId: crypto.randomUUID() };
            patch({ layers: [...draft.layers.slice(0, index + 1), duplicate, ...draft.layers.slice(index + 1)] });
            onChapterChange(`layer:${duplicate.layerId}`);
          }}
        />
        <ConfirmDeleteAction
          label="Remove layer"
          verb="remove"
          size="md"
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
        windowOffsetY={draft.windowOffsetY ?? 0}
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
  const full = draft.layers.length >= CUSTOM_CARD_MAX_LAYERS;
  const add = (layer: CardLayer) => {
    patch({ layers: [...draft.layers, layer] });
    onChapterChange(`layer:${layer.layerId}`);
  };
  return (
    <Stack gap="md">
      <Group>
        <LabeledAction
          intent="positive"
          icon={<Sticker size={16} />}
          disabledReason={full ? LAYERS_FULL : undefined}
          onClick={() => add(newCardDecal())}
        >
          Add decal
        </LabeledAction>
        <LabeledAction
          intent="positive"
          icon={<Type size={16} />}
          disabledReason={full ? LAYERS_FULL : undefined}
          onClick={() => add(newCardText(draft.format, undefined, draft.windowOffsetY))}
        >
          Add text
        </LabeledAction>
        <LabeledAction
          intent="positive"
          icon={<Coins size={16} />}
          disabledReason={full ? LAYERS_FULL : undefined}
          onClick={() => setPicking(true)}
        >
          Add token
        </LabeledAction>
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
      <Group gap={4} wrap="nowrap">
        <Text size="sm" c="dimmed">
          {draft.layers.length} of {CUSTOM_CARD_MAX_LAYERS} layers
        </Text>
        <HelpMark
          text={
            'Each layer has its own tab.\nLayers stack in tab order on each side of the frame.\nThe Head stays on top.'
          }
        />
      </Group>
      {draft.layers.length === 0 ? (
        <Notice title="No layers">Add decals and text, or choose a starting preset in Format.</Notice>
      ) : null}
      {draft.layers.map((layer, index) => (
        <LabeledAction
          key={layer.layerId}
          justify="start"
          icon={LAYER_ICON[layer.kind]}
          onClick={() => onChapterChange(`layer:${layer.layerId}`)}
        >
          {`${index + 1}. ${LAYER_NAME[layer.kind]}`}
        </LabeledAction>
      ))}
    </Stack>
  );
}
