import type { SvgDocument } from "../../svg/types";
import { effectiveViewBox, roundTo } from "../../svg/meta";
import type { PipelineContext } from "../context";
import type { PipelineStep } from "../step";

const SVG_NS = "http://www.w3.org/2000/svg";
const FLIP_ATTR = "data-flip";
const NON_RENDERED = new Set(["defs", "style", "title", "desc", "metadata"]);

export interface FlipConfig {
  /** Currently no global options; flips are driven by each doc's flip flags. */
  enabled?: boolean;
}

function fmt(n: number): string {
  return String(roundTo(n, 4));
}

function mirrorTransform(
  flip: { x: boolean; y: boolean },
  cx: number,
  cy: number,
): string | null {
  if (!flip.x && !flip.y) return null;
  const sx = flip.x ? -1 : 1;
  const sy = flip.y ? -1 : 1;
  const tx = flip.x ? 2 * cx : 0;
  const ty = flip.y ? 2 * cy : 0;
  return `translate(${fmt(tx)} ${fmt(ty)}) scale(${sx} ${sy})`;
}

/**
 * Idempotent mirror. Content is kept in its base orientation inside a managed
 * `<g data-flip>` wrapper; only the wrapper transform changes to reflect the
 * desired flip. Running repeatedly (or toggling off) always yields a state
 * consistent with the document's flip flags.
 */
export const mirrorFlip: PipelineStep<FlipConfig> = {
  id: "mirrorFlip",
  label: "Mirror / flip",
  description: "Mirror selected files horizontally and/or vertically.",
  defaultConfig: {},

  run(docs: SvgDocument[], _config: FlipConfig, ctx: PipelineContext) {
    return docs.map((doc) => {
      const el = ctx.parse(doc.current);
      try {
        const box = effectiveViewBox(el) ?? [0, 0, 0, 0];
        const cx = box[0] + box[2] / 2;
        const cy = box[1] + box[3] / 2;

        const existing = el.querySelector(`g[${FLIP_ATTR}]`);
        const transform = mirrorTransform(doc.flip, cx, cy);

        if (!transform) {
          // No flip desired: unwrap any existing flip group; if there is none the
          // document is untouched — return it verbatim so serialization cannot
          // reformat a no-op.
          if (existing && existing.parentNode === el) {
            while (existing.firstChild) {
              el.insertBefore(existing.firstChild, existing);
            }
            el.removeChild(existing);
            return { ...doc, current: ctx.serialize(el) };
          }
          return doc;
        }

        if (existing && existing.parentNode === el) {
          existing.setAttribute("transform", transform);
          return { ...doc, current: ctx.serialize(el) };
        }

        const group = el.ownerDocument.createElementNS(SVG_NS, "g");
        group.setAttribute(FLIP_ATTR, "");
        group.setAttribute("transform", transform);
        for (const node of Array.from(el.childNodes)) {
          if (
            node.nodeType === 1 &&
            NON_RENDERED.has((node as Element).tagName.toLowerCase())
          ) {
            continue;
          }
          group.appendChild(node);
        }
        el.appendChild(group);
        return { ...doc, current: ctx.serialize(el) };
      } catch {
        return doc;
      } finally {
        ctx.release(el);
      }
    });
  },
};
