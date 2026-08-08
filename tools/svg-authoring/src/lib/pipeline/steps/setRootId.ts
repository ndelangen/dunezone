import type { SvgDocument } from "../../svg/types";
import type { PipelineContext } from "../context";
import type { PipelineStep } from "../step";

export interface RootIdConfig {
  /** The id to assign to the root <svg> element. */
  id: string;
}

/**
 * Assigns an `id` to the root `<svg>` element (defaults to `root`). Useful when
 * referencing a whole icon via `<use href="#root">` from another document.
 * Runs late in the pipeline so optimizers (e.g. SVGO) can't strip the id.
 */
export const setRootId: PipelineStep<RootIdConfig> = {
  id: "setRootId",
  label: "Set root id",
  description: 'Add an id (default "root") to the <svg> element.',
  defaultConfig: { id: "root" },

  run(docs: SvgDocument[], config: RootIdConfig, ctx: PipelineContext) {
    const id = (config.id ?? "").trim();
    if (!id) return docs;
    return docs.map((doc) => {
      const el = ctx.parse(doc.current);
      try {
        el.setAttribute("id", id);
        return { ...doc, current: ctx.serialize(el) };
      } catch {
        return doc;
      } finally {
        ctx.release(el);
      }
    });
  },
};
