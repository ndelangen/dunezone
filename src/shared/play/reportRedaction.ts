/* Report exports include hidden gameplay, but never credentials or private contact details found in browser output. */
const PRIVATE_KEYS =
  /^(?:accessToken|refreshToken|authToken|token|password|secret|authorization|cookie|cookies|email|credential|credentials|pass|ticket|sessionId|userId|user_id|principalId)$/iu;

export function redactReportText(text: string): string {
  return text
    .replaceAll(/\bBearer\s+[^\s"'<>]+/giu, 'Bearer [redacted]')
    .replaceAll(/\beyJ[\w-]+\.[\w-]+(?:\.[\w-]+)?\b/gu, '[redacted credential]')
    .replaceAll(/\b(?:gh[pousr]_[a-zA-Z0-9_]+|github_pat_[a-zA-Z0-9_]+)\b/gu, '[redacted credential]')
    .replaceAll(/\b[a-f0-9]{64}\b/giu, '[redacted credential]')
    .replaceAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '[redacted email]')
    .replaceAll(
      /((?:token|password|secret|authorization|cookie|pass|ticket|code|key)\s*[=:]\s*)[^\s&,;"'<>]+/giu,
      '$1[redacted]'
    );
}

export function redactReportData(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactReportText(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactReportData);
  }
  if (value instanceof Map) {
    return redactReportData(Object.fromEntries(value));
  }
  if (value instanceof Set) {
    return redactReportData([...value]);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !PRIVATE_KEYS.test(key))
        .map(([key, child]) => [key, redactReportData(child)])
    );
  }
  return value;
}
