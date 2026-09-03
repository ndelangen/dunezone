import { Fragment, isValidElement } from 'react';

/**
 * The one warning behind every kit Layout's slot walk (#444).
 *
 * The walks match slot components by identity, so anything else is dropped without a trace, and the failure is silent in the worst way: a fragment or wrapper around a slot makes the layout render without it, and the page reads as one that chose that shape.
 * Measured on #921: a wrapped `PageLayout.Header` renders `data-page-layout-compact="true"`, the flag a page sets on purpose, so the shell confidently sizes the artwork to the mistake.
 * The precipitating incident was three blank Triptych columns that passed every gate (#443).
 *
 * Called from each walk's two silent paths: the not-an-element early return (which also swallows stray text) and the no-slot-matched fall-through.
 * Nulls, booleans and whitespace stay silent, so conditional slots keep working.
 * Dev only;
 * production builds carry nothing.
 */
export function warnDroppedChild(layout: string, slots: readonly string[], child: unknown): void {
  if (!import.meta.env.DEV) {
    return;
  }
  const slotList = slots.join(', ');
  if (typeof child === 'string' || typeof child === 'number') {
    if (String(child).trim().length === 0) {
      return;
    }
    console.warn(
      `[${layout}] Text content was dropped: this Layout renders its named slots and nothing else. ` +
        `Put page content inside one of ${slotList}.`
    );
    return;
  }
  if (!isValidElement(child)) {
    return;
  }
  const named =
    typeof child.type === 'function' || (typeof child.type === 'object' && child.type !== null)
      ? ((child.type as { displayName?: string; name?: string }).displayName ??
        (child.type as { name?: string }).name ??
        'a component')
      : null;
  const shape = child.type === Fragment ? 'a fragment' : (named ?? 'an element');
  console.warn(
    `[${layout}] A child that is ${shape} was dropped: slots are matched by identity, so only ` +
      `${slotList} register here. Never wrap a slot in a fragment or another component; pass it as a ` +
      'direct child, and put plain content inside a slot.'
  );
}
