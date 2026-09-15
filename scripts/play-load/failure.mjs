/** Keeps arbitrary rejected values readable without losing an empty-message failure. */
export function failureMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message || 'The operation failed without an error message.';
}
