/** Keep catalogue spotlight dates stable across routes and time zones. */
export function formatFactionCatalogueDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return 'recently';
  }
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
