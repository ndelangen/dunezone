import { tightlyCropSvg } from "@svg-fns/layout";
import type { SvgDocument } from "../../svg/types";
import type { PipelineContext } from "../context";
import type { PipelineStep } from "../step";

export interface CropConfig {
  /**
   * Safety margin as a fraction of the cropped art's larger dimension (0.02 = 2%).
   * Ratio-based because absolute units are meaningless across sources whose viewBoxes
   * range from ~100 to ~11,800 units (dunezone wayfinder #294).
   */
  marginRatio: number;
  /** Round resulting viewBox values (default true). */
  round?: boolean;
}

export const cropToContent: PipelineStep<CropConfig> = {
  id: "cropToContent",
  label: "Crop to content",
  description:
    "Trim the viewBox tightly to painted content, then expand by a proportional safety margin.",
  defaultConfig: { marginRatio: 0.02, round: true },

  run(docs: SvgDocument[], config: CropConfig, ctx: PipelineContext) {
    const ratio = Number.isFinite(config.marginRatio) ? Math.max(0, config.marginRatio) : 0;
    return docs.map((doc) => {
      const el = ctx.parse(doc.current);
      try {
        tightlyCropSvg(el, { padding: 0, mutate: true, round: false });
        const viewBox = el.getAttribute("viewBox");
        if (viewBox && ratio > 0) {
          const [x, y, w, h] = viewBox.trim().split(/[\s,]+/).map(Number);
          const margin = Math.max(w, h) * ratio;
          const round = config.round ?? true;
          const fix = (n: number) => (round ? Math.round(n * 100) / 100 : n);
          el.setAttribute(
            "viewBox",
            `${fix(x - margin)} ${fix(y - margin)} ${fix(w + margin * 2)} ${fix(h + margin * 2)}`,
          );
        }
        return { ...doc, current: ctx.serialize(el) };
      } catch {
        return doc;
      } finally {
        ctx.release(el);
      }
    });
  },
};
