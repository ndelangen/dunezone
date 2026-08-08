declare module "svg-path-simplify" {
  /**
   * Simplify/optimize an SVG string (or path data). Returns the processed SVG
   * string by default, or an object when `getObject` is set in settings.
   */
  export function svgPathSimplify(
    input?: string,
    settings?: Record<string, unknown>,
  ): string | { svg?: string; [key: string]: unknown };
}
