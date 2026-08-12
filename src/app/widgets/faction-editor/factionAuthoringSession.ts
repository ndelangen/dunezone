import type { Faction, FactionEntry } from '@db/factions';
import { FactionInputSchema } from '@game/schema/faction';

import { preserveFactionExtras } from './factionAuthoringContract';

/** The two form operations the session needs; the React form adapter satisfies this. */
export type FactionFormPort = {
  reset: (values: Faction, options?: { keepDefaultValues?: boolean }) => void;
  markLoadedDraftDirty: () => void;
};

export type FactionSessionPersistencePort = {
  save: (draft: Faction) => Promise<FactionEntry>;
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

/**
 * Faction authoring session: a framework-free machine owning the baselines (saved canonical vs.
 * loaded draft source), extras preservation, canonical validation, save lifecycle, and source
 * switching. React hosts only the rendering-bound form; the session drives it through
 * `FactionFormPort`. Testable in plain vitest with fake ports (ADR-0002).
 */
export function createFactionAuthoringSession({
  initialData,
  form,
  persistence,
  onSaved,
  onErrors,
}: {
  initialData: Faction;
  form: FactionFormPort;
  persistence: FactionSessionPersistencePort;
  onSaved: (entry: FactionEntry) => void;
  onErrors: (errors: string[]) => void;
}) {
  let savedBaseline = structuredClone(initialData);
  let draftSource = savedBaseline;

  return {
    /** The values `reset` returns to; replaced by the canonical result of each successful save. */
    get savedBaseline(): Faction {
      return savedBaseline;
    },

    async persistDraft(value: Faction): Promise<void> {
      const parsed = FactionInputSchema.safeParse(preserveFactionExtras(value, draftSource));
      if (!parsed.success) {
        onErrors([formatZodIssues(parsed.error)]);
        return;
      }

      onErrors([]);
      let entry: FactionEntry;
      try {
        entry = await persistence.save(parsed.data);
      } catch (error) {
        onErrors([error instanceof Error ? error.message : 'The faction could not be saved.']);
        return;
      }

      const canonical = structuredClone(entry.data);
      savedBaseline = canonical;
      draftSource = canonical;
      form.reset(canonical);
      onSaved(entry);
    },

    loadDraft(draft: Faction): void {
      const next = structuredClone(draft);
      draftSource = next;
      form.reset(next, { keepDefaultValues: true });
      form.markLoadedDraftDirty();
      persistence.reset();
      onErrors([]);
    },

    reset(): void {
      const baseline = structuredClone(savedBaseline);
      draftSource = baseline;
      form.reset(baseline);
      persistence.reset();
      onErrors([]);
    },

    /** Intentional change to another faction source; never silently saves the previous draft. */
    switchSource(nextInitialData: Faction): void {
      const next = structuredClone(nextInitialData);
      savedBaseline = next;
      draftSource = next;
      form.reset(next);
      persistence.reset();
      onErrors([]);
    },
  };
}
