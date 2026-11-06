/** Whether a key went to a text field, which keeps its keys: an input, text area, select, editable or text box element. */
export function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]') !== null)
  );
}
