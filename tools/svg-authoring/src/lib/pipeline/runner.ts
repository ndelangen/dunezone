import type { SvgDocument } from "../svg/types";
import { readMeta } from "../svg/meta";
import type { PipelineContext } from "./context";
import type { PipelineStep, StepInvocation } from "./step";

export interface RunOptions {
  /** Only pass selected documents to the step (default: true). */
  onlySelected?: boolean;
}

/**
 * Parse a document's current SVG and refresh its layout metadata. Returns the
 * document unchanged if parsing fails.
 */
export function computeMeta(doc: SvgDocument, ctx: PipelineContext): SvgDocument {
  try {
    const el = ctx.parse(doc.current);
    try {
      return { ...doc, meta: readMeta(el) };
    } finally {
      ctx.release(el);
    }
  } catch {
    return doc;
  }
}

function mergeById(
  all: SvgDocument[],
  processed: SvgDocument[],
): SvgDocument[] {
  const byId = new Map(processed.map((d) => [d.id, d]));
  return all.map((d) => byId.get(d.id) ?? d);
}

/**
 * Run a single step against a document set. Returns a new array with metadata
 * recomputed for every document the step touched.
 */
export function runStep<TConfig>(
  docs: SvgDocument[],
  step: PipelineStep<TConfig>,
  config: TConfig,
  ctx: PipelineContext,
  options: RunOptions = {},
): SvgDocument[] {
  const { onlySelected = true } = options;
  const targets = onlySelected ? docs.filter((d) => d.selected) : docs;
  if (targets.length === 0) return docs;

  const processed = step.run(targets, config, ctx);
  const merged = mergeById(docs, processed);
  const processedIds = new Set(processed.map((d) => d.id));
  return merged.map((d) => (processedIds.has(d.id) ? computeMeta(d, ctx) : d));
}

/**
 * Run an ordered list of step invocations, threading documents through each.
 */
export function runPipeline(
  docs: SvgDocument[],
  invocations: StepInvocation[],
  ctx: PipelineContext,
  options: RunOptions = {},
): SvgDocument[] {
  return invocations.reduce(
    (acc, { step, config }) => runStep(acc, step, config, ctx, options),
    docs,
  );
}
