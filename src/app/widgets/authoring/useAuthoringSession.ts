import { useForm, useStore } from '@tanstack/react-form';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { useCallback, useRef, useState } from 'react';

import { postedPayload } from './authoringEnvelope';
import type { AuthoringEnvelope, StoredShape } from './authoringEnvelope';
import { useValidationHeader } from './useValidationHeader';

/**
 * The foundation is two hooks rather than one, and the split is forced rather than chosen.
 *
 * An editor's warnings include its name-conflict complaint, which comes from a control that needs the draft's name, so the draft has to exist before the warning list does.
 * The validation header needs the finished list, so a single hook owning both would compute its count one render before the conflict reached it and leave a lone conflict unable to open the band.
 * Folding the name field into the hook would fix the order and is not available: it lives with the route organs, and a widget may not import `@app/routes/**`.
 * So the envelope comes first, the organ builds its warnings from it, and the session takes them.
 */

/** The draft and its session memory, plus the three ways anything changes either. */
export type AuthoringEnvelopeState<Data, Memory> = {
  draft: Data;
  memory: Memory;
  patch: (update: Partial<Data>) => void;
  remember: (update: Partial<Memory>) => void;
  /** Replace the draft wholesale and return memory to its opening state, which is what a Reset or a load does. */
  replace: (data: Data) => void;
};

/** The envelope as the form sees it: two records, so the form's key types never walk an unbounded generic. */
type OpaqueEnvelope = { data: Record<string, unknown>; memory: Record<string, unknown> };

/** The one place the typed envelope becomes the opaque one, cloned so nothing the caller still holds is shared with the form. */
function opaque(data: object, memory: object): OpaqueEnvelope {
  return {
    data: structuredClone(data) as Record<string, unknown>,
    memory: structuredClone(memory) as Record<string, unknown>,
  };
}

/** The save lifecycle an editor's mutation exposes; the mutation object stays the error channel. */
export type AuthoringPersistence<Saved> = {
  save: (payload: unknown) => Promise<Saved>;
  isPending: boolean;
  error: Error | null;
  hasSaved: boolean;
};

/**
 * The editor's state, held as an «authoring envelope» so what the session needs and what storage accepts stay separable.
 *
 * The stored schemas are strict, so a UI-only key beside the draft's own would be refused at save rather than ignored;
 * keeping it in `memory` means it resets with the draft instead of outliving it, which is the whole of D3 on «Work the editors wave».
 */
export function useAuthoringEnvelope<Data extends object, Memory extends object>({
  initialData,
  initialMemory,
}: {
  initialData: Data;
  initialMemory: Memory;
}): AuthoringEnvelopeState<Data, Memory> {
  /*
   * `useForm` re-applies this object on every render and overwrites an untouched form whenever it disagrees with the form's own defaults, so every replacement updates this ref in the same breath as the form's.
   * The faction adapter learned that first and its comment is the record.
   */
  const defaultsRef = useRef<OpaqueEnvelope>(undefined);
  defaultsRef.current ??= opaque(initialData, initialMemory);
  const openingMemoryRef = useRef(initialMemory);

  /*
   * The envelope crosses the form as an opaque pair of records.
   * The form's field-path types walk the whole value type, and walking an unbounded `Data` is what TypeScript reports as an excessively deep instantiation;
   * naming the two halves `Record<string, unknown>` stops the walk at the boundary this hook owns both sides of, and every caller still sees `Data` and `Memory` through the signature above.
   * The two casts here are the whole extent of it, and both are between the same value's typed and opaque views.
   */
  const form = useForm({ defaultValues: defaultsRef.current });
  const { data, memory } = useStore(form.store, (state) => state.values) as AuthoringEnvelope<Data, Memory>;

  const patch = useCallback(
    (update: Partial<Data>) => form.setFieldValue('data', (previous) => ({ ...previous, ...update })),
    [form]
  );
  const remember = useCallback(
    (update: Partial<Memory>) => form.setFieldValue('memory', (previous) => ({ ...previous, ...update })),
    [form]
  );
  const replace = useCallback(
    (next: Data) => {
      const envelope = opaque(next, openingMemoryRef.current);
      defaultsRef.current = envelope;
      form.reset(envelope);
    },
    [form]
  );

  return { draft: data, memory, patch, remember, replace };
}

/**
 * The authoring session every editor runs on: the validation header, the save and reset actions, and the status a toolbar renders.
 *
 * What it deliberately does not own: the chapter, the navigation a save leads to, and the words a toolbar says, all of which differ per editor and belong to the page.
 */
export function useAuthoringSession<Data extends { name: string }, Memory, Saved>({
  envelope,
  warnings,
  schema,
  persistence,
  onSaved,
}: {
  envelope: AuthoringEnvelopeState<Data, Memory>;
  /** The finished list, the editor's own warnings and its name conflict together, because the header opens on the count of what it will show. */
  warnings: readonly unknown[];
  /** The stored schema, read for its keys at save so memory can never ride along. */
  schema: StoredShape;
  persistence: AuthoringPersistence<Saved>;
  onSaved: (saved: Saved) => void;
}) {
  /* The values a reset returns to, replaced by what each successful save actually posted. */
  const [baseline, setBaseline] = useState<Data>(() => structuredClone(envelope.draft));
  const header = useValidationHeader(warnings.length);

  /*
   * Dirty reads the draft alone and never the memory beside it (D6 on «Work the editors wave»).
   * Memory is never posted, so counting it would arm a Save that writes an identical payload and then reports success over an unchanged row.
   * The accepted cost is that a declared mode is discarded by Reset without a word, even though it changes what a later action does.
   */
  const isDirty = JSON.stringify(envelope.draft) !== JSON.stringify(baseline);

  const saveState: AuthoringSaveState = persistence.isPending
    ? 'saving'
    : persistence.error
      ? 'error'
      : persistence.hasSaved
        ? 'saved'
        : 'idle';

  const reset = header.releasing(() => envelope.replace(baseline));

  const save = () => {
    const payload = postedPayload(schema, envelope.draft);
    /* The mutation object carries failures, the way every other save on this stack does, so nothing is lost by leaving the rejection here. */
    void persistence.save(payload).then(
      (saved) => {
        setBaseline(payload);
        onSaved(saved);
      },
      () => undefined
    );
  };

  return {
    header,
    status: { isDirty, isNameBlank: !envelope.draft.name.trim(), saveState },
    actions: { save, reset },
  };
}
