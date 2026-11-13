import { ensureFactionComponentIds } from '@shared/factions/componentIdentity';
import { FactionNameSchema } from '@shared/factions/schema';
import { normalizeInheritedFields, readField, resolveVariantData } from '@shared/factions/variantFields';
import type { InheritableField } from '@shared/factions/variantFields';
import { useForm, useStore } from '@tanstack/react-form';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { Faction, FactionEntry } from '@db/factions';
import { emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';

import { factionAuthoringWarnings, invalidPhaseRowCount } from './factionAuthoringContract';
import { createFactionAuthoringSession } from './factionAuthoringSession';
import type { StrengthRefusal } from './FactionFormSectionLeaders';
import type { FactionInheritance } from './FactionInheritance';

export type FactionAuthoringPersistence = {
  /** `inherited` names the fields the draft follows its parent in; absent for a variant without a parent. */
  save: (draft: Faction, inherited?: readonly InheritableField[]) => Promise<FactionEntry>;
  isPending: boolean;
  error: Error | null;
  hasSaved: boolean;
  reset: () => void;
};

/* The toolbar's words for the rows that hold Save; each row names its own problem inline in the Phases chapter. */
function invalidPhasesMessage(count: number): string | undefined {
  if (count === 0) {
    return undefined;
  }
  return count === 1
    ? 'A faction phase is incomplete. Finish it in Phases before saving.'
    : `${count} faction phases are incomplete. Finish them in Phases before saving.`;
}

export function useFactionAuthoring({
  sessionKey,
  initialData,
  inheritance,
  persistence,
  onSaved,
}: {
  sessionKey: string;
  initialData: Faction;
  /** For a variant with a parent: the parent's name and current data, and the fields the saved variant follows it in. */
  inheritance?: { parentName: string; parent: Faction; saved: readonly InheritableField[] };
  persistence: FactionAuthoringPersistence;
  onSaved: (entry: FactionEntry) => void;
}) {
  const sessionKeyRef = useRef(sessionKey);
  const [initialBaseline, setInitialBaseline] = useState<Faction>(() =>
    ensureFactionComponentIds(structuredClone(initialData))
  );
  const [errors, setErrors] = useState<string[]>([]);
  /*
   * The background composer's colour-mode memory. It belongs to the draft, and the composer cannot see
   * a Reset, so it is cleared below on the single wrapper every replace path in the session goes
   * through: reset, loadDraft, switchSource, and the reset that follows a successful save (#893).
   */
  const [backgroundModeMemory, setBackgroundModeMemory] = useState(emptyBackgroundModeMemory);
  /*
   * The manual complexity rating the author switched off, kept so switching back on restores it
   * rather than snapping to the calculated one. Same reason as the memory above: it belongs to the
   * draft, the complexity tab cannot see a Reset, and writing a discarded rating into a fresh draft
   * is what #608 grades breaks-rule (#894).
   */
  const [retainedManualComplexity, setRetainedManualComplexity] = useState<number | null>(null);
  const [strengthRefusal, setStrengthRefusal] = useState<StrengthRefusal>(null);
  /*
   * The fields the draft follows its parent in, once the author has changed any.
   * It belongs to the draft like the memories above, so the same wrapper clears it, and the draft then follows what is saved again.
   */
  const [inheritedDraft, setInheritedDraft] = useState<InheritableField[] | null>(null);

  const sessionRef = useRef<ReturnType<typeof createFactionAuthoringSession> | null>(null);
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
    defaultValues: initialBaseline,
    onSubmit: async ({ value }) => await sessionRef.current?.persistDraft(value),
  });

  /*
   * A field switched to its parent takes the parent's value at once, so the previews show what the save will store.
   * Switched back to custom it keeps that value, as the place the author's own edits start from.
   */
  const draftInheritance: FactionInheritance | undefined = inheritance && {
    parentName: inheritance.parentName,
    parent: inheritance.parent,
    inherited: inheritedDraft ?? inheritance.saved,
    onChange: (field, followsParent) => {
      const current = inheritedDraft ?? inheritance.saved;
      setInheritedDraft(
        normalizeInheritedFields(
          followsParent ? [...current, field] : current.filter((candidate) => candidate !== field)
        )
      );
      if (followsParent) {
        form.setFieldValue(field, readField(inheritance.parent, field) as never);
      }
    },
  };
  const inherited = draftInheritance?.inherited;

  const latestRef = useRef({ persistence, onSaved, inherited, saved: inheritance });
  useLayoutEffect(() => {
    latestRef.current = { persistence, onSaved, inherited, saved: inheritance };
  }, [persistence, onSaved, inherited, inheritance]);

  const saveDraft = useCallback(
    (draft: Faction) => latestRef.current.persistence.save(draft, latestRef.current.inherited),
    []
  );
  const resetPersistence = useCallback(() => latestRef.current.persistence.reset(), []);
  const saved = useCallback((entry: FactionEntry) => latestRef.current.onSaved(entry), []);
  useLayoutEffect(() => {
    if (sessionRef.current) {
      return;
    }
    sessionRef.current = createFactionAuthoringSession({
      initialData: initialBaseline,
      form: {
        reset: (values, options) => {
          if (!options?.keepDefaultValues) {
            /*
             * form.reset(values) adopts `values` as the form's defaultValues, but useForm
             * re-applies the hook's defaultValues on every render and overwrites an
             * untouched form whenever the two disagree. Keep the hook's copy in step.
             */
            setInitialBaseline(structuredClone(values));
          }
          setBackgroundModeMemory(emptyBackgroundModeMemory());
          setRetainedManualComplexity(null);
          setStrengthRefusal(null);
          setInheritedDraft(null);
          form.reset(values, options);
        },
        markLoadedDraftDirty: () => form.setFieldMeta('name', (meta) => ({ ...meta, isDirty: true, isTouched: true })),
      },
      persistence: {
        save: saveDraft,
        reset: resetPersistence,
      },
      onSaved: saved,
      onErrors: setErrors,
    });
  }, [initialBaseline, form, saveDraft, resetPersistence, saved]);

  useEffect(() => {
    if (sessionKeyRef.current === sessionKey) {
      return;
    }
    sessionKeyRef.current = sessionKey;
    sessionRef.current?.switchSource(initialData);
  }, [initialData, sessionKey]);

  const editing = useStore(form.store, (state) => {
    const isNameBlank = state.values.name.trim().length === 0;
    const parsedName = FactionNameSchema.safeParse(state.values.name);
    return {
      isDirty: state.isDirty,
      isNameBlank,
      invalid:
        !isNameBlank && !parsedName.success
          ? parsedName.error.issues[0]?.message
          : invalidPhasesMessage(invalidPhaseRowCount(state.values)),
      warnings: factionAuthoringWarnings(state.values),
    };
  });

  const inheritanceChanged = inheritance !== undefined && inherited?.join() !== inheritance.saved.join();
  /* A field that follows the parent has no inputs on screen, so a blank in it is the parent's to fill, not a warning here. */
  const warnings = editing.warnings.filter(
    (warning) =>
      !inherited?.some(
        (field) =>
          warning.path === field || warning.path.startsWith(`${field}.`) || warning.path.startsWith(`${field}[`)
      )
  );

  /* A loaded draft keeps to the variant's saved inheritance, as the server would on its save. */
  const loadDraft = useCallback((draft: Faction) => {
    const { saved } = latestRef.current;
    sessionRef.current?.loadDraft(
      saved
        ? resolveVariantData(ensureFactionComponentIds(saved.parent), ensureFactionComponentIds(draft), saved.saved)
        : draft
    );
  }, []);
  const reset = useCallback(() => sessionRef.current?.reset(), []);
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
    editing: { ...editing, warnings, isDirty: editing.isDirty || inheritanceChanged },
    inheritance: draftInheritance,
    backgroundModeMemory,
    setBackgroundModeMemory,
    retainedManualComplexity,
    setRetainedManualComplexity,
    strengthRefusal,
    setStrengthRefusal,
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
