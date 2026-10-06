import {
  Alert,
  Button,
  ColorInput,
  Group,
  NumberInput,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { RECTANGLE_TOKEN_FONTS } from '@shared/assets/schema';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { TopicIcon } from '@ui/content/TopicIcon';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { PreviewChoice } from '@ui/control/PreviewChoice';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Heading1, Layers3, LayoutTemplate, Stamp } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import type { BackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import { BackgroundPresetControl } from '@app/widgets/background-composer/BackgroundPresetControl';
import { DecalControls } from '@app/widgets/decal-editor/DecalControls';
import { assetOptionToPreviewSrc, decalAssetOptions } from '@app/widgets/faction-editor/factionFormAssetUtils';
import { CustomCard } from '@game/assets/card/Custom';
import { backgroundPresets } from '@game/data/backgrounds';
import { card } from '@game/data/sizes';

import styles from './CustomCardEditor.module.css';
import { CUSTOM_CARD_PRESETS, newCardDecal, newCardText } from './customCardPresets';
import type { CardLayer, CustomCardDraft } from './customCardPresets';

export type { CustomCardDraft } from './customCardPresets';
export { INITIAL_CUSTOM_CARD_DRAFT } from './customCardPresets';
export type CustomCardChapter = 'head' | 'format' | 'layers' | 'about' | `layer:${string}`;
export type CustomCardMemory = { headCustom: boolean; headModeMemory: BackgroundModeMemory };
export const INITIAL_CUSTOM_CARD_MEMORY: CustomCardMemory = {
  headCustom: false,
  headModeMemory: emptyBackgroundModeMemory(),
};

const HEAD_PRESETS = ['weapon', 'defense', 'special', 'worthless'].map((key) => ({
  key,
  label: key[0].toUpperCase() + key.slice(1),
  background: backgroundPresets[key as 'weapon' | 'defense' | 'special' | 'worthless'],
}));
type Patch = (update: Partial<CustomCardDraft>) => void;

function CardProof({ draft }: { draft: CustomCardDraft }) {
  return (
    <CanvasScale rounded canvasWidth={card.width} canvasHeight={card.height} frameClassName={styles.proofFrame}>
      <CustomCard {...draft} />
    </CanvasScale>
  );
}

function Presets({ draft, patch }: { draft: CustomCardDraft; patch: Patch }) {
  const [pending, setPending] = useState<string | null>(null);
  const apply = (key: string) => {
    const preset = CUSTOM_CARD_PRESETS.find((candidate) => candidate.key === key);
    if (preset) {
      patch({
        format: preset.format,
        layers: preset.layers.map((layer) => ({ ...structuredClone(layer), layerId: crypto.randomUUID() })),
      });
    }
    setPending(null);
  };
  return (
    <Stack gap="sm">
      <PreviewChoice
        label="Starting preset"
        value=""
        onChange={(key) => (draft.layers.length ? setPending(key) : apply(key))}
        aspectRatio={String(card.width / card.height)}
        options={CUSTOM_CARD_PRESETS.map((preset) => ({
          value: preset.key,
          label: preset.label,
          preview: (
            <CustomCard {...draft} name="Custom card" subName="" format={preset.format} layers={preset.layers} />
          ),
          canvas: { width: card.width, height: card.height },
        }))}
      />
      {pending ? (
        <Alert title="Replace the current layers?" color="gray">
          <Stack gap="sm">
            <Text size="sm">
              This preset replaces all decals and text blocks. The name, type, Head background and About stay as they
              are.
            </Text>
            <Group>
              <Button variant="default" onClick={() => setPending(null)}>
                Keep current layers
              </Button>
              <Button onClick={() => apply(pending)}>Replace layers</Button>
            </Group>
          </Stack>
        </Alert>
      ) : null}
    </Stack>
  );
}

function LayerFields({
  layer,
  index,
  format,
  onChange,
}: {
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
      ) : (
        <>
          <ControlBlock
            title="Text"
            input={
              <FormattedTextInput
                aria-label={`Text for ${label.toLowerCase()}`}
                value={layer.content}
                onChange={(content) => onChange({ ...layer, content })}
              />
            }
          />
          <Select
            label="Font"
            aria-label={`Font for ${label.toLowerCase()}`}
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
              aria-label={`Text size for ${label.toLowerCase()}`}
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
              aria-label={`Alignment for ${label.toLowerCase()}`}
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
              aria-label={`Width for ${label.toLowerCase()}`}
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
              aria-label={`Height for ${label.toLowerCase()}`}
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
            aria-label={`Text color for ${label.toLowerCase()}`}
            format="hex"
            value={layer.color}
            onChangeEnd={(color) => {
              if (/^#[0-9a-fA-F]{6}$/.test(color)) {
                onChange({ ...layer, color });
              }
            }}
          />
        </>
      )}
      {layer.kind === 'text' ? <LayerPlacement layer={layer} format={format} onChange={onChange} /> : null}
      <Group grow>
        <NumberInput
          label="Opacity"
          aria-label={`Opacity for ${label.toLowerCase()}`}
          value={layer.opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(opacity) => {
            if (typeof opacity === 'number') {
              onChange({ ...layer, opacity });
            }
          }}
        />
        <NumberInput
          label="Rotation"
          aria-label={`Rotation for ${label.toLowerCase()}`}
          value={layer.rotation}
          min={-360}
          max={360}
          onChange={(rotation) => {
            if (typeof rotation === 'number') {
              onChange({ ...layer, rotation });
            }
          }}
        />
      </Group>
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
          : "Place the decal's centre, measured from the card's top-left corner."}
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
            Centre in decal window
          </Button>
        ) : null}
      </Group>
    </Stack>
  );
}

function LayerPanel({
  draft,
  patch,
  index,
  onChapterChange,
}: {
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

function Layers({
  draft,
  patch,
  onChapterChange,
}: {
  draft: CustomCardDraft;
  patch: Patch;
  onChapterChange: (chapter: CustomCardChapter) => void;
}) {
  const add = (layer: CardLayer) => {
    patch({ layers: [...draft.layers, layer] });
    onChapterChange(`layer:${layer.layerId}`);
  };
  return (
    <Stack gap="md">
      <Group>
        <Button variant="default" onClick={() => add(newCardDecal())}>
          Add decal
        </Button>
        <Button variant="default" onClick={() => add(newCardText(draft.format))}>
          Add text
        </Button>
      </Group>
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
          {index + 1}. {layer.kind === 'decal' ? 'Decal' : 'Text'}
        </Button>
      ))}
    </Stack>
  );
}

export function customCardDraftWarnings(
  draft: CustomCardDraft
): { source: string; missing: string; chapter: CustomCardChapter }[] {
  return draft.layers.length ? [] : [{ source: 'Layers', missing: 'any decal or text', chapter: 'layers' }];
}

/** Callers own the card and session memory; this owns the authoring controls and live proof. */
export function CustomCardEditor({
  nameField,
  draft,
  patch,
  memory,
  remember,
  chapter,
  onChapterChange,
  onSettle,
}: {
  nameField: ReactNode;
  draft: CustomCardDraft;
  patch: Patch;
  memory: CustomCardMemory;
  remember: (update: Partial<CustomCardMemory>) => void;
  chapter: CustomCardChapter;
  onChapterChange: (chapter: CustomCardChapter) => void;
  onSettle: () => void;
}) {
  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        <div onBlurCapture={onSettle}>
          <ConnectedTabs<CustomCardChapter>
            value={
              chapter.startsWith('layer:') && !draft.layers.some((layer) => `layer:${layer.layerId}` === chapter)
                ? 'layers'
                : chapter
            }
            onValueChange={(next) => {
              onChapterChange(next);
              onSettle();
            }}
            ariaLabel="Custom card chapters"
            items={[
              {
                value: 'head',
                label: 'Head',
                icon: <Heading1 size={21} aria-hidden />,
                panel: (
                  <Stack gap="lg">
                    <ControlBlock
                      title="Name"
                      description="Names the card and determines its URL. Long titles resize to fit."
                      input={nameField}
                    />
                    <ControlBlock
                      title="Type"
                      input={
                        <TextInput
                          aria-label="Type"
                          value={draft.subName}
                          onChange={(event) => patch({ subName: event.currentTarget.value })}
                        />
                      }
                    />
                    <ControlBlock
                      title="Icon"
                      input={
                        <Stack gap="sm">
                          <Switch
                            label="Show Icon"
                            checked={!!draft.icon}
                            onChange={(event) =>
                              patch({
                                icon: event.currentTarget.checked
                                  ? [backgroundPresets.stripedSpecial, '/vector/icon/karama.svg']
                                  : undefined,
                              })
                            }
                          />
                          {draft.icon ? (
                            <AssetSelect
                              aria-label="Icon"
                              allowDeselect={false}
                              data={stockAssetOptions(decalAssetOptions)}
                              getPreviewSrc={assetOptionToPreviewSrc}
                              glyphPreviews
                              value={draft.icon[1]}
                              onChange={(value) => {
                                if (value && draft.icon) {
                                  patch({ icon: [draft.icon[0], value as NonNullable<CustomCardDraft['icon']>[1]] });
                                }
                              }}
                            />
                          ) : null}
                        </Stack>
                      }
                    />
                    <BackgroundPresetControl
                      title="Head background"
                      description="The background behind the card name."
                      usedOn="this card's Head"
                      presets={HEAD_PRESETS}
                      value={draft.head}
                      declaredCustom={memory.headCustom}
                      onDeclaredCustomChange={(headCustom) => remember({ headCustom })}
                      modeMemory={memory.headModeMemory}
                      onModeMemoryChange={(headModeMemory) => remember({ headModeMemory })}
                      onChange={(head) => patch({ head })}
                    />
                  </Stack>
                ),
              },
              {
                value: 'format',
                label: 'Format',
                icon: <LayoutTemplate size={21} aria-hidden />,
                panel: (
                  <Stack gap="lg">
                    <ControlBlock
                      title="Format"
                      description="Changing the frame keeps every layer where you placed it."
                      input={
                        <PreviewChoice
                          label="Card format"
                          value={draft.format}
                          onChange={(format) => patch({ format })}
                          aspectRatio={String(card.width / card.height)}
                          options={(['decal-window', 'plain'] as const).map((format) => ({
                            value: format,
                            label: format === 'plain' ? 'Plain' : 'With decal window',
                            preview: <CustomCard {...draft} format={format} />,
                            canvas: { width: card.width, height: card.height },
                          }))}
                        />
                      }
                    />
                    <ControlBlock
                      title="Starting preset"
                      description="An editable starting layout. Every layer can be changed afterward."
                      input={<Presets draft={draft} patch={patch} />}
                    />
                  </Stack>
                ),
              },
              {
                value: 'layers',
                label: 'Layers',
                icon: <Layers3 size={21} aria-hidden />,
                panel: <Layers draft={draft} patch={patch} onChapterChange={onChapterChange} />,
              },
              ...draft.layers.map((layer, index) => ({
                value: `layer:${layer.layerId}` as CustomCardChapter,
                label: `${index + 1}. ${layer.kind === 'decal' ? 'Decal' : 'Text'}`,
                icon: layer.kind === 'decal' ? <Stamp size={21} aria-hidden /> : <TopicIcon topic="text" size={21} />,
                panel: <LayerPanel draft={draft} patch={patch} index={index} onChapterChange={onChapterChange} />,
              })),
              aboutChapter(draft.about, (about) => patch({ about })),
            ]}
          />
        </div>
      </WorkbenchLayout.Chapters>
      <WorkbenchLayout.Rail>
        <CardProof draft={draft} />
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
