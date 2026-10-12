import type { CustomCardAsset } from '@shared/assets/schema';
import {
  CustomCardAssetInput,
  CustomCardAsset as CustomSchema,
  StormCardAsset,
  StormCardAssetInput,
} from '@shared/assets/schema';
import type { ComponentProps, ComponentType } from 'react';
import type { z } from 'zod';

import type { StoredShape } from '@app/widgets/authoring/authoringEnvelope';
import {
  CustomCardEditor,
  INITIAL_CUSTOM_CARD_DRAFT,
  customCardDraftWarnings,
} from '@app/widgets/card-editor/CustomCardEditor';
import type { CustomCardChapter } from '@app/widgets/card-editor/CustomCardEditor';
import { StormCardEditor, INITIAL_STORM_CARD_DRAFT } from '@app/widgets/card-editor/StormCardEditor';

export type LayeredCardDraft = Pick<z.infer<typeof CustomCardAsset>, 'name' | 'about' | 'layers'>;
export type LayeredCardEditing<Draft extends LayeredCardDraft> = {
  type: 'card-custom' | 'card-storm';
  schemaName: string;
  schema: z.ZodType<Draft>;
  input: z.ZodType<Draft> & StoredShape;
  initial: Draft;
  warnings: (draft: Draft) => { source: string; missing: string; chapter: CustomCardChapter }[];
  Editor: ComponentType<
    Omit<ComponentProps<typeof CustomCardEditor>, 'draft' | 'patch'> & {
      draft: Draft;
      patch: (update: Partial<Draft>) => void;
    }
  >;
};

/* Both route families share draft handling and token reads; each card type supplies its own contract and controls. */
export const customCardEditing = {
  type: 'card-custom',
  schemaName: 'custom card',
  schema: CustomSchema,
  input: CustomCardAssetInput,
  initial: INITIAL_CUSTOM_CARD_DRAFT,
  warnings: customCardDraftWarnings,
  Editor: CustomCardEditor,
} satisfies LayeredCardEditing<z.infer<typeof CustomSchema>>;

export const stormCardEditing = {
  type: 'card-storm',
  schemaName: 'storm card',
  schema: StormCardAsset,
  input: StormCardAssetInput,
  initial: INITIAL_STORM_CARD_DRAFT,
  warnings: () => [],
  Editor: StormCardEditor,
} satisfies LayeredCardEditing<z.infer<typeof StormCardAsset>>;
