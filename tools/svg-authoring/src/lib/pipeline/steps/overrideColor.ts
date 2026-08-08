import type { SvgDocument } from "../../svg/types";
import type { PipelineContext } from "../context";
import type { PipelineStep } from "../step";

export type ColorTarget = "fill" | "stroke" | "both";

export interface OverrideColorConfig {
  /** The color to apply (any valid CSS color, e.g. "#000", "red", "currentColor"). */
  color: string;
  /** Which paint properties to override. */
  target: ColorTarget;
}

const NONE = "none";

/** Replace a paint attribute on an element, preserving explicit `none`. */
function recolorAttr(el: Element, attr: "fill" | "stroke", color: string): void {
  const value = el.getAttribute(attr);
  if (value !== null && value.trim().toLowerCase() !== NONE) {
    el.setAttribute(attr, color);
  }
}

/** Rewrite `fill`/`stroke` declarations inside an inline style, preserving `none`. */
function recolorStyle(el: Element, target: ColorTarget, color: string): void {
  const style = el.getAttribute("style");
  if (!style) return;
  const next = style.replace(
    /(fill|stroke)\s*:\s*([^;]+)/gi,
    (match, prop: string, val: string) => {
      const p = prop.toLowerCase();
      const applies =
        target === "both" || target === (p as "fill" | "stroke");
      if (!applies) return match;
      if (val.trim().toLowerCase() === NONE) return match;
      return `${prop}:${color}`;
    },
  );
  if (next !== style) el.setAttribute("style", next);
}

/**
 * Override the paint color of every painted element. Fill is also set on the
 * root so elements relying on the default (black) fill are recolored too.
 * Elements explicitly set to `none` are left untouched, preserving holes and
 * stroke-only shapes.
 */
export const overrideColor: PipelineStep<OverrideColorConfig> = {
  id: "overrideColor",
  label: "Override color",
  description: "Recolor every shape's fill and/or stroke to a single color.",
  defaultConfig: { color: "#000000", target: "fill" },

  run(docs: SvgDocument[], config: OverrideColorConfig, ctx: PipelineContext) {
    const color = (config.color ?? "").trim();
    const target = config.target ?? "fill";
    if (!color) return docs;
    const wantsFill = target === "fill" || target === "both";
    const wantsStroke = target === "stroke" || target === "both";

    return docs.map((doc) => {
      const el = ctx.parse(doc.current);
      try {
        if (wantsFill) el.setAttribute("fill", color);
        const all = el.querySelectorAll("*");
        all.forEach((node) => {
          if (wantsFill) recolorAttr(node, "fill", color);
          if (wantsStroke) recolorAttr(node, "stroke", color);
          recolorStyle(node, target, color);
        });
        recolorStyle(el, target, color);
        return { ...doc, current: ctx.serialize(el) };
      } catch {
        return doc;
      } finally {
        ctx.release(el);
      }
    });
  },
};
