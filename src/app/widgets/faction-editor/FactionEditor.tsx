import { Alert, Stack } from '@mantine/core';
import { forwardRef, useImperativeHandle, useRef } from 'react';

import type { Faction } from '@db/factions';
import type { BackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';

import type { FactionAuthoringWarning } from './factionAuthoringContract';
import styles from './FactionEditor.module.css';
import { FactionFormFields } from './FactionFormFields';
import type { FactionFormFieldsHandle } from './FactionFormFields';
import type { FactionIdentityNameField } from './FactionFormSectionIdentity';
import type { FactionFormApi } from './factionFormTypes';
import { FactionSheetReview } from './FactionSheetReview';
import type { FactionSheetReviewHandle } from './FactionSheetReview';

export interface FactionEditorProps {
  form: FactionFormApi;
  errors: string[];
  isNameBlank: boolean;
  warnings: FactionAuthoringWarning[];
  /** A route-bound name input rendered in the Identity section's name slot; see `FactionIdentityNameField`. */
  nameField?: FactionIdentityNameField;
  /** Fires on field blur and chapter switch, the moments the validation header may settle closed. */
  onSettle?: () => void;
  /** The background composer's colour-mode memory, from `useFactionAuthoring`, which clears it whenever the draft is replaced. */
  backgroundModeMemory: BackgroundModeMemory;
  onBackgroundModeMemoryChange: (memory: BackgroundModeMemory) => void;
  /** The switched-off manual complexity rating, from `useFactionAuthoring`, which clears it on a replace. */
  retainedManualComplexity: number | null;
  onRetainedManualComplexityChange: (rating: number) => void;
}

export interface FactionAuthoringViewHandle {
  focusFirstWarning: () => void;
  focusWarning: (warning: FactionAuthoringWarning) => void;
  openReview: (trigger?: HTMLElement | null) => void;
}

export const FactionEditor = forwardRef<FactionAuthoringViewHandle, FactionEditorProps>(
  (
    {
      form,
      errors,
      isNameBlank,
      warnings,
      nameField,
      onSettle,
      backgroundModeMemory,
      onBackgroundModeMemoryChange,
      retainedManualComplexity,
      onRetainedManualComplexityChange,
    },
    ref
  ) => {
    const reviewRef = useRef<FactionSheetReviewHandle>(null);
    const fieldsRef = useRef<FactionFormFieldsHandle>(null);

    useImperativeHandle(ref, () => ({
      focusFirstWarning: () => {
        const firstWarning = warnings[0];
        if (!firstWarning) {
          return;
        }
        fieldsRef.current?.focusWarning(firstWarning);
      },
      focusWarning: (warning) => fieldsRef.current?.focusWarning(warning),
      openReview: (trigger) => reviewRef.current?.open(trigger),
    }));

    return (
      <div className={styles.root}>
        <Stack gap="sm">
          {errors.map((error) => (
            <Alert color="red" variant="light" role="alert" key={error} title="Could not save">
              {error}
            </Alert>
          ))}
        </Stack>

        <form.Subscribe selector={(state: { values: Faction }) => state.values}>
          {(values) => {
            return (
              <FactionSheetReview ref={reviewRef} faction={values}>
                <FactionFormFields
                  ref={fieldsRef}
                  form={form}
                  warnings={warnings}
                  nameField={nameField}
                  onSettle={onSettle}
                  backgroundModeMemory={backgroundModeMemory}
                  onBackgroundModeMemoryChange={onBackgroundModeMemoryChange}
                  retainedManualComplexity={retainedManualComplexity}
                  onRetainedManualComplexityChange={onRetainedManualComplexityChange}
                  nameError={
                    isNameBlank
                      ? 'A faction name is required before saving because it determines the faction URL.'
                      : undefined
                  }
                />
              </FactionSheetReview>
            );
          }}
        </form.Subscribe>
      </div>
    );
  }
);
