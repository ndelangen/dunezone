import { Alert, Stack } from '@mantine/core';
import { useForm } from '@tanstack/react-form';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { type Faction, type FactionEntry } from '@db/factions';

import styles from './FactionEditor.module.css';
import { FactionFormFields } from './FactionFormFields';
import { FactionSheetReview } from './FactionSheetReview';
import {
  type FactionAuthoringWarning,
  factionAuthoringWarnings,
  preserveFactionExtras,
} from './factionAuthoringContract';

export interface FactionEditorProps {
  factionEntry: FactionEntry;
  errors: string[];
  onSubmit: (values: Faction) => void;
  onStateChange?: (state: FactionEditorState) => void;
}

export interface FactionEditorState {
  isDirty: boolean;
  isNameBlank: boolean;
  warnings: FactionAuthoringWarning[];
}

export interface FactionEditorHandle {
  submit: () => void;
  load: (entry?: FactionEntry['data']) => void;
  markSaved: (entry: FactionEntry['data']) => void;
  focusFirstWarning: () => void;
  getValues: () => Faction;
}

export const FactionEditor = forwardRef<FactionEditorHandle, FactionEditorProps>(
  ({ factionEntry, errors, onSubmit, onStateChange }, ref) => {
    const initialValuesRef = useRef<Faction>(structuredClone(factionEntry.data));
    const baselineRef = useRef<Faction>(structuredClone(factionEntry.data));

    useEffect(() => {
      initialValuesRef.current = structuredClone(factionEntry.data);
      baselineRef.current = structuredClone(factionEntry.data);
    }, [factionEntry.data]);

    const form = useForm<
      Faction,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    >({
      defaultValues: initialValuesRef.current,
      onSubmit: ({ value }) => onSubmit(preserveFactionExtras(value, baselineRef.current)),
    });

    useEffect(() => {
      const reportState = () => {
        const values = form.state.values;
        onStateChange?.({
          isDirty: form.state.isDirty,
          isNameBlank: values.name.trim().length === 0,
          warnings: factionAuthoringWarnings(values),
        });
      };
      reportState();
      const subscription = form.store.subscribe(reportState);
      return () => subscription.unsubscribe();
    }, [form, onStateChange]);

    useImperativeHandle(ref, () => ({
      submit: () => {
        void form.handleSubmit();
      },
      load: (entry?: FactionEntry['data']) => {
        if (entry) {
          const next = structuredClone(entry);
          baselineRef.current = next;
          initialValuesRef.current = next;
          form.reset(next);
        } else {
          form.reset(structuredClone(baselineRef.current));
        }
      },
      markSaved: (entry) => {
        const next = structuredClone(entry);
        baselineRef.current = next;
        initialValuesRef.current = next;
        form.reset(next);
      },
      focusFirstWarning: () => {
        const firstWarning = factionAuthoringWarnings(form.state.values)[0];
        if (!firstWarning) return;
        const target = document.getElementById(firstWarning.targetId);
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target?.focus({ preventScroll: true });
      },
      getValues: () => form.state.values,
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
            const warnings = factionAuthoringWarnings(values);
            const isNameBlank = values.name.trim().length === 0;
            return (
              <FactionSheetReview faction={values}>
                <FactionFormFields
                  form={form}
                  warnings={warnings}
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
