import { useEffect, useRef, useState } from "react";

import { useAppStore } from "@/store/useAppStore";
import { loadPrefs, savePrefs } from "@/lib/persistence/prefs";
import { loadSession, saveSession } from "@/lib/persistence/session";

/**
 * Wires the store to browser persistence:
 * - pipeline config (steps) <-> localStorage
 * - working documents <-> IndexedDB
 *
 * Returns whether the initial hydration has completed so the UI can avoid a
 * flash of empty state.
 */
export function usePersistence(): { hydrated: boolean } {
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const prefs = loadPrefs();
    if (prefs) {
      // Merge so newly added steps keep their defaults.
      const current = useAppStore.getState().steps;
      useAppStore.getState().setSteps({ ...current, ...prefs });
    }

    loadSession()
      .then((docs) => {
        // Restore only while the workspace is still pristine: a whole-array
        // replace must never discard documents the user added while the
        // IndexedDB read was in flight.
        if (docs && docs.length > 0 && useAppStore.getState().docs.length === 0) {
          useAppStore.setState({ docs, previewId: docs[0].id });
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  // Persist on change (debounced for docs which can be large).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastDocs = useAppStore.getState().docs;
    let lastSteps = useAppStore.getState().steps;

    const unsub = useAppStore.subscribe((state) => {
      if (state.steps !== lastSteps) {
        lastSteps = state.steps;
        savePrefs(state.steps);
      }
      if (state.docs !== lastDocs) {
        lastDocs = state.docs;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void saveSession(lastDocs), 400);
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, []);

  return { hydrated };
}
