import { redactReportText } from './reportRedaction';

export function redactedMessage(length: number): string {
  return `-redacted message, original length: ${length}-`;
}

const messageLength = (text: string) => Array.from(text).length;

/** Keeps conversation diagnostics while replacing message text and author names before serialization. */
export function censorReportConversations(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(censorReportConversations);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === 'text' && typeof child === 'string'
        ? /^-redacted message, original length: \d+-$/u.test(child)
          ? child
          : redactedMessage(messageLength(child))
        : key === 'author'
          ? '[redacted sender]'
          : censorReportConversations(child),
    ])
  );
}

/** Covers console strings that contain a chat message directly or inside serialized JSON. */
export function censorKnownMessage(value: string, message: string): string {
  if (!message) {
    return value;
  }
  const replacement = redactedMessage(messageLength(message));
  const escaped = JSON.stringify(message).slice(1, -1);
  for (const variant of new Set([message, escaped, redactReportText(message), redactReportText(escaped)])) {
    if (!value.includes(variant)) {
      continue;
    }
    value = value
      .split(/(-redacted message, original length: \d+-)/gu)
      .map((part, index) => (index % 2 ? part : part.replaceAll(variant, replacement)))
      .join('');
  }
  return value;
}

/** Raw browser chat travels only to the room, which combines it with saved messages before censoring the export. */
export function reportConversationTexts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(reportConversationTexts);
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'text' && typeof child === 'string' ? [child] : reportConversationTexts(child)
  );
}
