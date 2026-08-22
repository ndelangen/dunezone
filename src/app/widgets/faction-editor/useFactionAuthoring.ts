import { useForm, useStore } from '@tanstack/react-form';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Faction, FactionEntry } from '@db/factions';

import { factionAuthoringWarnings } from './factionAuthoringContract';
import { createFactionAuthoringSession } from './factionAuthoringSession';

export type FactionAuthoringPersistence = {
  save: (draft: Faction) => Promise<FactionEntry>;
  isPending: boolean;
  error: Error | null;
  hasSaved: boolean;
  reset: () => void;
};

export function useFactionAuthoring({
  sessionKey,
  initialData,
  persistence,
  onSaved,
}: {
  sessionKey: string;
  initialData: Faction;
  persistence: FactionAuthoringPersistence;
  onSaved: (entry: FactionEntry) => void;
}) {
  const sessionKeyRef = useRef(sessionKey);
  const initialBaselineRef = useRef<Faction>(undefined);
  initialBaselineRef.current ??= structuredClone(initialData);
  const [errors, setErrors] = useState<string[]>([]);

  const sessionRef = useRef<ReturnType<typeof createFactionAuthoringSession>>(undefined);
  const latestRef = useRef({ persistence, onSaved });
  latestRef.current = { persistence, onSaved };

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
    defaultValues: initialBaselineRef.current,
    onSubmit: async ({ value }) => await sessionRef.current?.persistDraft(value),
  });

  sessionRef.current ??= createFactionAuthoringSession({
    initialData,
    form: {
      reset: (values, options) => {
        if (!options?.keepDefaultValues) {
          /*
           * form.reset(values) adopts `values` as the form's defaultValues, but useForm
           * re-applies the hook's defaultValues on every render and overwrites an
           * untouched form whenever the two disagree, keep the hook's copy in step.
           */
          initialBaselineRef.current = structuredClone(values);
        }
        form.reset(values, options);
      },
      markLoadedDraftDirty: () => form.setFieldMeta('name', (meta) => ({ ...meta, isDirty: true, isTouched: true })),
    },
    persistence: {
      save: (draft) => latestRef.current.persistence.save(draft),
      reset: () => latestRef.current.persistence.reset(),
    },
    onSaved: (entry) => latestRef.current.onSaved(entry),
    onErrors: setErrors,
  });
  const session = sessionRef.current;

  useEffect(() => {
    if (sessionKeyRef.current === sessionKey) {
      return;
    }
    sessionKeyRef.current = sessionKey;
    session.switchSource(initialData);
  }, [initialData, session, sessionKey]);

  const editing = useStore(form.store, (state) => ({
    isDirty: state.isDirty,
    isNameBlank: state.values.name.trim().length === 0,
    warnings: factionAuthoringWarnings(state.values),
  }));

  const loadDraft = useCallback((draft: Faction) => session.loadDraft(draft), [session]);
  const reset = useCallback(() => session.reset(), [session]);
  const submit = useCallback(async () => await form.handleSubmit(), [form]);

  const saveState: AuthoringSaveState = persistence.isPending
    ? 'saving'
    : persistence.error
      ? 'error'
      : persistence.hasSaved
        ? 'saved'
        : 'idle';

  return {
    form,
    editing,
    persistence: {
      saveState,
      errors,
    },
    actions: {
      loadDraft,
      reset,
      submit,
    },
  };
}
