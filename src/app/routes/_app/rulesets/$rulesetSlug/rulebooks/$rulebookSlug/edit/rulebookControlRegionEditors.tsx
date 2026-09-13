import { SegmentedControl, Stack, Switch, Textarea, TextInput } from '@mantine/core';
import type { rulebookLayoutCatalogue, RulebookPageDraft, RulebookPageLayoutId } from '@shared/rulebooks/contents';
import { rulebookCoverPresetCatalogue, rulebookCoverPresetIdSchema } from '@shared/rulebooks/coverPresets';
import { userImageSourceUrlSchema } from '@shared/user-images/contract';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import type { ComponentType, ReactNode } from 'react';

type PageOfLayout<LayoutId extends RulebookPageLayoutId> = Extract<RulebookPageDraft, { layoutId: LayoutId }>;
type LayoutOfId<LayoutId extends RulebookPageLayoutId> = Extract<
  (typeof rulebookLayoutCatalogue)[number],
  { id: LayoutId }
>;

/** The Control-region keys owned by one Page layout. */
export type RulebookControlRegionKey<LayoutId extends RulebookPageLayoutId> = Extract<
  LayoutOfId<LayoutId>['regions'][number],
  { kind: 'control' }
>['key'];

/** The exact Page-owned value edited by one Control-region counterpart. */
export type RulebookControlRegionEditorValue<
  LayoutId extends RulebookPageLayoutId,
  RegionKey extends RulebookControlRegionKey<LayoutId>,
> = RegionKey extends keyof PageOfLayout<LayoutId>['controlValues']
  ? PageOfLayout<LayoutId>['controlValues'][RegionKey]
  : never;

/** The complete membrane shared by every Control-region editor. */
export type RulebookControlRegionEditorProps<
  LayoutId extends RulebookPageLayoutId,
  RegionKey extends RulebookControlRegionKey<LayoutId>,
> = Readonly<{
  value: RulebookControlRegionEditorValue<LayoutId, RegionKey>;
  onChange: (nextValue: RulebookControlRegionEditorValue<LayoutId, RegionKey>) => void;
}> &
  (LayoutId extends 'cover' ? { footerFactionControls?: ReactNode } : unknown);

type RulebookControlRegionEditorRegistry = {
  [LayoutId in RulebookPageLayoutId]: {
    [RegionKey in RulebookControlRegionKey<LayoutId>]: ComponentType<
      RulebookControlRegionEditorProps<LayoutId, RegionKey>
    >;
  };
};

function ChapterLabelEdit({ value, onChange }: RulebookControlRegionEditorProps<'chapter-opener', 'chapter-label'>) {
  return (
    <TextInput
      label="Chapter label"
      description="Name the chapter or section introduced by this Page."
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function PageGuidanceEdit({ value, onChange }: RulebookControlRegionEditorProps<'rules-page', 'guidance'>) {
  return (
    <Stack gap="md">
      <TextInput
        label="Eyebrow"
        description="Add the short label shown above this Page's introduction."
        value={value.eyebrow}
        onChange={(event) => onChange({ ...value, eyebrow: event.currentTarget.value })}
      />
      <FormattedTextInput
        label="Introduction"
        description="Introduce the rules collected on this Page."
        autosize
        minRows={5}
        value={value.introduction}
        onChange={(introduction) => onChange({ ...value, introduction })}
      />
    </Stack>
  );
}

/** Every Page layout and Control region must have exactly its typed counterpart. */
function CoverEdit({ value, onChange, footerFactionControls }: RulebookControlRegionEditorProps<'cover', 'cover'>) {
  const sourceUrl = value.backgroundImageUrl ?? value.backgroundImage?.sourceUrl ?? '';
  const checkedUrl = sourceUrl.trim() ? userImageSourceUrlSchema.safeParse(sourceUrl) : null;
  const presetId = value.backgroundSource?.kind === 'preset' ? value.backgroundSource.presetId : undefined;
  const footer = value.footer ?? { enabled: false, title: '', label: '' };
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
      <ControlBlock
        title="Cover footer"
        description="Add a title between two faction emblems, with an optional label band below."
        input={
          <Switch
            aria-label="Show cover footer"
            checked={footer.enabled}
            onChange={(event) => onChange({ ...value, footer: { ...footer, enabled: event.currentTarget.checked } })}
          />
        }
      />
      {footer.enabled ? (
        <Stack gap="md">
          <ControlBlock
            title="Footer title"
            input={
              <Textarea
                aria-label="Footer title"
                value={footer.title}
                autosize
                minRows={2}
                onChange={(event) => onChange({ ...value, footer: { ...footer, title: event.currentTarget.value } })}
              />
            }
          />
          {footerFactionControls}
          <ControlBlock
            title="Footer label"
            input={
              <TextInput
                aria-label="Footer label"
                value={footer.label}
                onChange={(event) => onChange({ ...value, footer: { ...footer, label: event.currentTarget.value } })}
              />
            }
          />
        </Stack>
      ) : null}
    </Stack>
  );
}

export const rulebookControlRegionEditors = {
  'chapter-opener': {
    'chapter-label': ChapterLabelEdit,
  },
  'rules-page': {
    guidance: PageGuidanceEdit,
  },
  'visual-reference': {},
  'single-column': {},
  'two-columns': {},
  'wide-narrow': {},
  'outer-rail': {},
  'band-columns': {},
  cover: { cover: CoverEdit },
} satisfies RulebookControlRegionEditorRegistry;
