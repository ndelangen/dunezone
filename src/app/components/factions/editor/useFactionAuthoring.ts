import { useForm, useStore } from '@tanstack/react-form';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Faction, FactionEntry } from '@db/factions';
import type { FactionSaveState } from '@app/factions/authoringState';
import { FactionInputSchema } from '@game/schema/faction';

import { factionAuthoringWarnings, preserveFactionExtras } from './factionAuthoringContract';

export type FactionAuthoringPersistence = {
  save: (draft: Faction) => Promise<FactionEntry>;
  isPending: boolean;
  error: Error | null;
  hasSaved: boolean;
  reset: () => void;
};

function formatZodIssues(error: {
  issues: readonly { path: PropertyKey[]; message: string }[];
}): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map((segment) => String(segment)).join('.') || '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('\n');
}

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
  const savedBaselineRef = useRef(initialBaselineRef.current);
  const draftSourceRef = useRef(initialBaselineRef.current);
  const [errors, setErrors] = useState<string[]>([]);

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
    defaultValues: savedBaselineRef.current,
    onSubmit: async ({ value }) => await persistDraft(value),
  });

  async function persistDraft(value: Faction) {
    const parsed = FactionInputSchema.safeParse(
      preserveFactionExtras(value, draftSourceRef.current)
    );
    if (!parsed.success) {
      setErrors([formatZodIssues(parsed.error)]);
      return;
    }

    setErrors([]);
    let entry: FactionEntry;
    try {
      entry = await persistence.save(parsed.data);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'The faction could not be saved.']);
      return;
    }

    const canonical = structuredClone(entry.data);
    savedBaselineRef.current = canonical;
    draftSourceRef.current = canonical;
    form.reset(canonical);
    onSaved(entry);
  }

  useEffect(() => {
    if (sessionKeyRef.current === sessionKey) {
      return;
    }

    sessionKeyRef.current = sessionKey;
    const next = structuredClone(initialData);
    savedBaselineRef.current = next;
    draftSourceRef.current = next;
    form.reset(next);
    persistence.reset();
    setErrors([]);
  }, [form, initialData, persistence, sessionKey]);

  const editing = useStore(form.store, (state) => ({
    isDirty: state.isDirty,
    isNameBlank: state.values.name.trim().length === 0,
    warnings: factionAuthoringWarnings(state.values),
  }));

  const loadDraft = useCallback(
    (draft: Faction) => {
      const next = structuredClone(draft);
      draftSourceRef.current = next;
      form.reset(next, { keepDefaultValues: true });
      form.setFieldMeta('name', (meta) => ({ ...meta, isDirty: true, isTouched: true }));
      persistence.reset();
      setErrors([]);
    },
    [form, persistence]
  );

  const reset = useCallback(() => {
    const baseline = structuredClone(savedBaselineRef.current);
    draftSourceRef.current = baseline;
    form.reset(baseline);
    persistence.reset();
    setErrors([]);
  }, [form, persistence]);

  const submit = useCallback(async () => await form.handleSubmit(), [form]);

  const saveState: FactionSaveState = persistence.isPending
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
