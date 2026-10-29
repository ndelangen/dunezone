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

type ReportScope = 'browser' | 'game';

/* Public card handles are HMACs, not credentials, and references must keep their distinct identities. */
const CARD_REFERENCE_FIELDS = new Set([
  'id',
  'itemId',
  'pieceId',
  'sourcePieceId',
  'targetPieceId',
  'selectedPieceId',
  'pickedUpItemIds',
  'cardIds',
  'leaderIds',
  'handOrder',
]);

function privateReportKey(key: string, scope: ReportScope) {
  /* The server's typed game snapshots and captures use token for artwork, never authentication. */
  if (scope === 'game' && key.toLowerCase() === 'token') {
    return false;
  }
  return PRIVATE_KEYS.test(key);
}

export function redactReportData(value: unknown, scope: ReportScope = 'browser'): unknown {
  return redactValue(value, scope);
}

function redactValue(value: unknown, scope: ReportScope, field = ''): unknown {
  if (typeof value === 'string') {
    if (CARD_REFERENCE_FIELDS.has(field) && /^card-[a-f0-9]{64}$/u.test(value)) {
      return value;
    }
    return redactReportText(value);
  }
  if (Array.isArray(value)) {
    return value.map((child) => redactValue(child, scope, field));
  }
  if (value instanceof Map) {
    return redactValue(Object.fromEntries(value), scope, field);
  }
  if (value instanceof Set) {
    return redactValue([...value], scope, field);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !privateReportKey(key, scope))
        .map(([key, child]) => [key, redactValue(child, scope, key)])
    );
  }
  return value;
}
