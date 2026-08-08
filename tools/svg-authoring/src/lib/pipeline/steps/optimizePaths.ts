import SVGPathCommander from "svg-path-commander";
import { svgPathSimplify } from "svg-path-simplify";
import type { SvgDocument } from "../../svg/types";
import { getSvgo, optimizeWithSvgo } from "../../svg/svgoLoader";
import type { PipelineContext } from "../context";
import type { PipelineStep } from "../step";

export type OptimizeLevel = "light" | "medium" | "heavy";

export interface OptimizeConfig {
  level: OptimizeLevel;
  /** Decimal precision for coordinate rounding. */
  decimalPrecision: number;
  /** Strip comments and editor metadata. */
  removeMetadata: boolean;
}

const COMMENT_NODE = 8;
const STRIP_TAGS = new Set(["metadata"]);

function stripJunk(el: Element): void {
  const walker = el.ownerDocument.createTreeWalker(el, 0xffffffff);
  const toRemove: Node[] = [];
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === COMMENT_NODE) {
      toRemove.push(node);
    } else if (
      node.nodeType === 1 &&
      STRIP_TAGS.has((node as Element).tagName.toLowerCase())
    ) {
      toRemove.push(node);
    }
    node = walker.nextNode();
  }
  for (const n of toRemove) n.parentNode?.removeChild(n);
}

/** Light: per-path optimize via svg-path-commander + rounding. */
function optimizeLight(
  svg: SVGSVGElement,
  precision: number,
  removeMetadata: boolean,
): void {
  if (removeMetadata) stripJunk(svg);
  const paths = svg.querySelectorAll("path");
  paths.forEach((path) => {
    const d = path.getAttribute("d");
    if (!d) return;
    try {
      const optimized = new SVGPathCommander(d, { round: precision })
        .optimize()
        .toString();
      if (optimized) path.setAttribute("d", optimized);
    } catch {
      /* leave path untouched on parse failure */
    }
  });
}

/** Medium: whole-document simplification via svg-path-simplify. */
function optimizeMedium(svgString: string, precision: number, removeMetadata: boolean): string {
  try {
    const result = svgPathSimplify(svgString, {
      decimals: precision,
      removeComments: removeMetadata,
      removeMetadata,
      simplifyBezier: true,
      removeColinear: true,
      mergePaths: false,
    } as Record<string, unknown>);
    if (typeof result === "string" && result.includes("<svg")) {
      return result;
    }
    if (
      result &&
      typeof result === "object" &&
      typeof (result as { svg?: string }).svg === "string"
    ) {
      return (result as { svg: string }).svg;
    }
  } catch {
    /* fall through to original */
  }
  return svgString;
}

export const optimizePaths: PipelineStep<OptimizeConfig> = {
  id: "optimizePaths",
  label: "Optimize",
  description:
    "Clean up dirty paths: simplify commands, drop redundant points, round coordinates, strip metadata.",
  defaultConfig: { level: "light", decimalPrecision: 2, removeMetadata: true },

  run(docs: SvgDocument[], config: OptimizeConfig, ctx: PipelineContext) {
    const precision = Number.isFinite(config.decimalPrecision)
      ? config.decimalPrecision
      : 2;

    return docs.map((doc) => {
      if (config.level === "medium") {
        const next = optimizeMedium(doc.current, precision, config.removeMetadata);
        return { ...doc, current: next };
      }

      if (config.level === "heavy") {
        // SVGO must be preloaded by the caller (store) before running. If it
        // is not yet available we degrade gracefully to medium.
        if (getSvgo()) {
          return { ...doc, current: optimizeWithSvgo(doc.current, precision) };
        }
        return { ...doc, current: optimizeMedium(doc.current, precision, config.removeMetadata) };
      }

      // light
      const el = ctx.parse(doc.current);
      try {
        optimizeLight(el, precision, config.removeMetadata);
        return { ...doc, current: ctx.serialize(el) };
      } catch {
        return doc;
      } finally {
        ctx.release(el);
      }
    });
  },
};
