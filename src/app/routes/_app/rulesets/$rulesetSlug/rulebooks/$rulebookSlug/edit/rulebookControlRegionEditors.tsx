import { Stack, Textarea, TextInput } from '@mantine/core';
import type { rulebookLayoutCatalogue, RulebookPageDraft, RulebookPageLayoutId } from '@shared/rulebooks/contents';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import type { ComponentType } from 'react';

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
}>;

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
function CoverEdit({ value, onChange }: RulebookControlRegionEditorProps<'cover', 'cover'>) {
  return (
    <Stack gap="md">
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
