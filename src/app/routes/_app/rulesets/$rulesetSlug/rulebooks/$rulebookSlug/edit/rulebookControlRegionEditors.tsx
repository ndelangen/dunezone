import { SegmentedControl, Stack, Switch, Textarea, TextInput } from '@mantine/core';
import type { RulebookCoverFooter, rulebookLayoutCatalogue, RulebookPageDraft } from '@shared/rulebooks/contents';
import { rulebookCoverPresetCatalogue, rulebookCoverPresetIdSchema } from '@shared/rulebooks/coverPresets';
import { userImageSourceUrlSchema } from '@shared/user-images/contract';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import type { ComponentType, ReactNode } from 'react';

type RulebookCover = Extract<RulebookPageDraft, { layoutId: 'cover' }>['controlValues']['cover'];

export function CoverEdit({
  value,
  onChange,
}: Readonly<{ value: RulebookCover; onChange: (nextValue: RulebookCover) => void }>) {
  const sourceUrl = value.backgroundImageUrl ?? value.backgroundImage?.sourceUrl ?? '';
  const checkedUrl = sourceUrl.trim() ? userImageSourceUrlSchema.safeParse(sourceUrl) : null;
  const presetId = value.backgroundSource?.kind === 'preset' ? value.backgroundSource.presetId : undefined;
  return (
    <Stack gap="md">
      <ControlBlock
        title="Cover image"
        input={
          <SegmentedControl
            aria-label="Cover image source"
            value={presetId ? 'preset' : 'url'}
            data={[
              { value: 'preset', label: 'Preset' },
              { value: 'url', label: 'Image URL' },
            ]}
            onChange={(kind) =>
              onChange({
                ...value,
                backgroundSource: kind === 'preset' ? { kind: 'preset', presetId: 'sandworm' } : { kind: 'url' },
                backgroundImageUrl: '',
                backgroundImage: undefined,
              })
            }
          />
        }
      />
      {presetId ? (
        <ControlBlock
          title="Preset"
          description="Choose an illustration. The Page preview shows how it is cropped to this Rulebook's size."
          input={
            <AssetSelect
              aria-label="Cover preset"
              allowDeselect={false}
              data={rulebookCoverPresetCatalogue.map(({ id, label }) => ({ value: id, label }))}
              getPreviewSrc={(id) => rulebookCoverPresetCatalogue.find((preset) => preset.id === id)?.thumbnailUrl}
              value={presetId}
              onChange={(id) => {
                if (id) {
                  onChange({
                    ...value,
                    backgroundSource: { kind: 'preset', presetId: rulebookCoverPresetIdSchema.parse(id) },
                    backgroundImageUrl: '',
                    backgroundImage: undefined,
                  });
                }
              }}
            />
          }
        />
      ) : (
        <ControlBlock
          title="Background image URL"
          description="Paste an HTTPS image URL. Save stores a copy for this Rulebook. The image fills the Page and is cropped at the edges when its proportions differ."
          input={
            <TextInput
              aria-label="Background image URL"
              type="url"
              value={sourceUrl}
              error={checkedUrl && !checkedUrl.success ? checkedUrl.error.issues[0]?.message : undefined}
              onChange={(event) =>
                onChange({
                  ...value,
                  backgroundImageUrl: event.currentTarget.value,
                  backgroundImage: undefined,
                  showDuneLogo: value.showDuneLogo ?? true,
                })
              }
            />
          }
        />
      )}
      <ControlBlock
        title="Dune logo"
        description="Show the Dune logo over the cover image."
        input={
          <Switch
            aria-label="Show Dune logo"
            checked={value.showDuneLogo ?? false}
            onChange={(event) => onChange({ ...value, showDuneLogo: event.currentTarget.checked })}
          />
        }
      />
      <ControlBlock
        title="Show subtitle"
        description="Hide the subtitle without removing its text."
        input={
          <Switch
            aria-label="Show subtitle"
            checked={value.showSubtitle ?? true}
            onChange={(event) => onChange({ ...value, showSubtitle: event.currentTarget.checked })}
          />
        }
      />
      {value.showSubtitle !== false ? (
        <ControlBlock
          title="Subtitle"
          description="Optional subtitle below the Page title."
          input={
            <TextInput
              aria-label="Subtitle"
              value={value.subtitle}
              onChange={(event) => onChange({ ...value, subtitle: event.currentTarget.value })}
            />
          }
        />
      ) : null}
      <ControlBlock
        title="Supporting text"
        description="Optional short introduction or edition details."
        input={
          <Textarea
            aria-label="Supporting text"
            value={value.supportingText}
            onChange={(event) => onChange({ ...value, supportingText: event.currentTarget.value })}
            autosize
            minRows={3}
          />
        }
      />
    </Stack>
  );
}

export function CoverFooterEdit({
  value,
  onChange,
  footerFactionControls,
}: Readonly<{
  value: RulebookCoverFooter;
  onChange: (nextValue: RulebookCoverFooter) => void;
  footerFactionControls?: ReactNode;
}>) {
  return (
    <Stack gap="md">
      <ControlBlock
        title="Cover footer"
        description="Add a title between two faction emblems, with an optional label band below."
        input={
          <Switch
            aria-label="Show cover footer"
            checked={value.enabled}
            onChange={(event) => onChange({ ...value, enabled: event.currentTarget.checked })}
          />
        }
      />
      {value.enabled ? (
        <Stack gap="md">
          <ControlBlock
            title="Footer title"
            input={
              <Textarea
                aria-label="Footer title"
                value={value.title}
                autosize
                minRows={2}
                onChange={(event) => onChange({ ...value, title: event.currentTarget.value })}
              />
            }
          />
          {footerFactionControls}
          <ControlBlock
            title="Footer label"
            input={
              <TextInput
                aria-label="Footer label"
                value={value.label}
                onChange={(event) => onChange({ ...value, label: event.currentTarget.value })}
              />
            }
          />
        </Stack>
      ) : null}
    </Stack>
  );
}

type RulebookControlRegionPath<Layout = (typeof rulebookLayoutCatalogue)[number]> = Layout extends {
  id: infer Id extends string;
  regions: readonly (infer Region extends { kind: string; key: string })[];
}
  ? `${Id}.${Extract<Region, { kind: 'control' }>['key']}`
  : never;

// A Control region added to any layout in the catalogue is a compile error here until it has an editor.
({ 'cover.cover': CoverEdit, 'cover.footer': CoverFooterEdit }) satisfies Record<
  RulebookControlRegionPath,
  ComponentType<never>
>;
