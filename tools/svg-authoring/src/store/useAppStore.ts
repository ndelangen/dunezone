import { create } from "zustand";
import type { SvgDocument } from "@/lib/svg/types";
import {
  createPipelineContext,
  type PipelineContext,
  type StepInvocation,
  computeMeta,
  runStep,
  runPipeline,
  mirrorFlip,
  PIPELINE_STEPS,
  getStep,
} from "@/lib/pipeline";
import { createDocFromPaste } from "@/lib/svg/ingest";
import { ensureSvgo } from "@/lib/svg/svgoLoader";

let _ctx: PipelineContext | null = null;
/** Lazily create the browser-only pipeline context. */
function ctx(): PipelineContext {
  if (!_ctx) _ctx = createPipelineContext();
  return _ctx;
}

export interface StepUiState {
  enabled: boolean;
  config: Record<string, unknown>;
}

/** Steps enabled by default on a fresh session. */
const DEFAULT_ENABLED = new Set(["cropToContent", "mirrorFlip", "setRootId", "stampAuthored", "formatCode"]);

function defaultSteps(): Record<string, StepUiState> {
  const out: Record<string, StepUiState> = {};
  for (const step of PIPELINE_STEPS) {
    out[step.id] = {
      enabled: DEFAULT_ENABLED.has(step.id),
      config: { ...(step.defaultConfig as Record<string, unknown>) },
    };
  }
  return out;
}

export interface AppState {
  docs: SvgDocument[];
  previewId: string | null;
  steps: Record<string, StepUiState>;
  zipName: string;

  setZipName: (name: string) => void;
  addDocs: (docs: SvgDocument[]) => void;
  addPaste: (source: string, name?: string) => SvgDocument | null;
  removeDoc: (id: string) => void;
  clearAll: () => void;
  toggleSelected: (id: string) => void;
  setAllSelected: (selected: boolean) => void;
  setPreview: (id: string) => void;
  toggleFlip: (id: string, axis: "x" | "y") => void;
  resetDoc: (id: string) => void;

  setStepEnabled: (stepId: string, enabled: boolean) => void;
  setStepConfig: (stepId: string, patch: Record<string, unknown>) => void;
  setSteps: (steps: Record<string, StepUiState>) => void;
  runStepById: (stepId: string) => Promise<void>;
  runPipeline: () => Promise<void>;
}

function needsSvgo(steps: Record<string, StepUiState>): boolean {
  const opt = steps.optimizePaths;
  return !!opt?.enabled && opt.config.level === "heavy";
}

function withMeta(docs: SvgDocument[]): SvgDocument[] {
  return docs.map((d) => computeMeta(d, ctx()));
}

export const useAppStore = create<AppState>((set, get) => ({
  docs: [],
  previewId: null,
  steps: defaultSteps(),
  zipName: "svg-pipeline-export",

  setZipName: (name) => set({ zipName: name }),

  addDocs: (incoming) => {
    if (incoming.length === 0) return;
    const withMetaDocs = withMeta(incoming);
    set((state) => ({
      docs: [...state.docs, ...withMetaDocs],
      previewId: state.previewId ?? withMetaDocs[0]?.id ?? null,
    }));
  },

  addPaste: (source, name) => {
    const doc = computeMeta(createDocFromPaste(source, name), ctx());
    set((state) => ({
      docs: [...state.docs, doc],
      previewId: state.previewId ?? doc.id,
    }));
    return doc;
  },

  removeDoc: (id) =>
    set((state) => {
      const docs = state.docs.filter((d) => d.id !== id);
      const previewId =
        state.previewId === id ? (docs[0]?.id ?? null) : state.previewId;
      return { docs, previewId };
    }),

  clearAll: () => set({ docs: [], previewId: null }),

  toggleSelected: (id) =>
    set((state) => ({
      docs: state.docs.map((d) =>
        d.id === id ? { ...d, selected: !d.selected } : d,
      ),
    })),

  setAllSelected: (selected) =>
    set((state) => ({
      docs: state.docs.map((d) => ({ ...d, selected })),
    })),

  setPreview: (id) => set({ previewId: id }),

  toggleFlip: (id, axis) =>
    set((state) => ({
      docs: state.docs.map((d) => {
        if (d.id !== id) return d;
        const flip = { ...d.flip, [axis]: !d.flip[axis] };
        const [flipped] = mirrorFlip.run([{ ...d, flip }], {}, ctx());
        return computeMeta(flipped, ctx());
      }),
    })),

  resetDoc: (id) =>
    set((state) => ({
      docs: state.docs.map((d) =>
        d.id === id
          ? computeMeta(
              { ...d, current: d.original, flip: { x: false, y: false } },
              ctx(),
            )
          : d,
      ),
    })),

  setStepEnabled: (stepId, enabled) =>
    set((state) => ({
      steps: {
        ...state.steps,
        [stepId]: { ...state.steps[stepId], enabled },
      },
    })),

  setStepConfig: (stepId, patch) =>
    set((state) => ({
      steps: {
        ...state.steps,
        [stepId]: {
          ...state.steps[stepId],
          config: { ...state.steps[stepId].config, ...patch },
        },
      },
    })),

  setSteps: (steps) => set({ steps }),

  runStepById: async (stepId) => {
    const step = getStep(stepId);
    if (!step) return;
    if (stepId === "optimizePaths" && get().steps[stepId].config.level === "heavy") {
      try {
        await ensureSvgo();
      } catch {
        /* heavy optimize will degrade to medium */
      }
    }
    // Read state AFTER the potentially slow await so edits made while SVGO
    // loaded are not overwritten by a stale snapshot.
    const { docs, steps } = get();
    const next = runStep(docs, step, steps[stepId].config, ctx());
    set({ docs: next });
  },

  runPipeline: async () => {
    if (needsSvgo(get().steps)) {
      try {
        await ensureSvgo();
      } catch {
        /* heavy optimize will degrade to medium */
      }
    }
    // Read state AFTER the potentially slow await so edits made while SVGO
    // loaded are not overwritten by a stale snapshot.
    const { docs, steps } = get();
    const invocations: StepInvocation[] = PIPELINE_STEPS.filter(
      (s) => steps[s.id]?.enabled,
    ).map((s) => ({ step: s, config: steps[s.id].config }));
    if (invocations.length === 0) return;
    // The pipeline is a pure function of (original, flip flags, config): reset
    // selected docs to their source first so repeated runs are deterministic.
    const reset = docs.map((d) =>
      d.selected ? { ...d, current: d.original } : d,
    );
    const next = runPipeline(reset, invocations, ctx());
    set({ docs: next });
  },
}));
