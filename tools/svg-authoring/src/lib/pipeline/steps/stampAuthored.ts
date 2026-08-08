import { VECTOR_AUTHORED_ATTRIBUTE } from "@dunezone/shared/vectorRules";
import type { SvgDocument } from "../../svg/types";
import type { PipelineContext } from "../context";
import type { PipelineStep } from "../step";

export interface StampConfig {
  /** Free-form provenance note appended after the tool name. */
  note: string;
}

/**
 * Stamps the root element with the authoring provenance attribute the dunezone verifier
 * requires on every media/vector source (wayfinder #298): it proves the file went through
 * this tool's pipeline. The build generator strips the stamp from published output.
 */
export const stampAuthored: PipelineStep<StampConfig> = {
  id: "stampAuthored",
  label: "Stamp provenance",
  description:
    "Mark the file as processed by this tool (required by the dunezone vector verifier).",
  defaultConfig: { note: "" },

  run(docs: SvgDocument[], config: StampConfig, ctx: PipelineContext) {
    const value = config.note ? `svg-authoring ${config.note}` : "svg-authoring";
    return docs.map((doc) => {
      const el = ctx.parse(doc.current);
      try {
        el.setAttribute(VECTOR_AUTHORED_ATTRIBUTE, value);
        return { ...doc, current: ctx.serialize(el) };
      } catch {
        return doc;
      } finally {
        ctx.release(el);
      }
    });
  },
};
