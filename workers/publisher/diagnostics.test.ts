import { describe, expect, test } from 'vitest';

import {
  publisherErrorDetails,
  publisherErrorMessage,
  redactPublisherResource,
  sanitizePublisherDiagnostic,
  serializePublisherLogEvent,
} from '../../src/app/capture/publisher-diagnostics';

const signedUrl =
  'https://signed-user:SECRET_PASSWORD@cdn.example.com/private/SECRET_PATH/art.png?token=SECRET_QUERY#SECRET_FRAGMENT';
const networkPath =
  '//signed-user:SECRET_PASSWORD@cdn.example.com/private/SECRET_PATH/art.png?token=SECRET_QUERY#SECRET_FRAGMENT';
const signedSuffix = '/SECRET_PATH?token=SECRET_QUERY#SECRET_FRAGMENT';
const secrets = [
  'signed-user',
  'SECRET_PASSWORD',
  'SECRET_PATH',
  'SECRET_QUERY',
  'SECRET_FRAGMENT',
];

describe('publisher diagnostic redaction', () => {
  test('retains only the external origin and a redacted marker', () => {
    const redacted = redactPublisherResource(signedUrl);
    expect(redacted).toBe('https://cdn.example.com/<redacted>');
    for (const secret of secrets) expect(redacted).not.toContain(secret);
  });

  test('removes signed URLs embedded inside arbitrary page errors', () => {
    const diagnostic = sanitizePublisherDiagnostic(`Failed to decode ${signedUrl}`);
    expect(diagnostic).toContain('https://cdn.example.com/<redacted>');
    for (const secret of secrets) expect(diagnostic).not.toContain(secret);
  });

  test('removes scheme-relative signed URLs and centralizes error/log conversion', () => {
    const message = publisherErrorMessage(new Error(`Failed to decode ${networkPath}`));
    const log = serializePublisherLogEvent({
      event: 'asset_publisher_test',
      nested: { error: new Error(`Nested ${signedUrl}`), message },
    });
    expect(message).toContain('https://cdn.example.com/<redacted>');
    expect(log).toContain('https://cdn.example.com/<redacted>');
    for (const secret of secrets) {
      expect(message).not.toContain(secret);
      expect(log).not.toContain(secret);
    }
  });

  test('flattens sanitized AggregateError members and Error causes for telemetry', () => {
    const root = new Error(`Failed to decode ${signedUrl}`);
    const staged = new Error('Browser capture failed during validate_page_bounds', { cause: root });
    const aggregate = new AggregateError([staged], 'Item-list publisher execution failed');

    const details = publisherErrorDetails(aggregate);

    expect(details.map((detail) => detail.message)).toEqual([
      'Item-list publisher execution failed',
      'Browser capture failed during validate_page_bounds',
      'Failed to decode https://cdn.example.com/<redacted>',
    ]);
    for (const secret of secrets) expect(JSON.stringify(details)).not.toContain(secret);
  });

  test.each([
    'integer division 8//2 failed',
    'ratio x//y is invalid',
    'Windows-like C://Users/me/file failed',
    'module specifier node://internal/path',
    'identifier_//host/path',
    'file.//host/path',
    'flag-//host/path',
    'path///host/path',
  ])('preserves benign non-URL double-slash diagnostics: %s', (diagnostic) => {
    expect(sanitizePublisherDiagnostic(diagnostic)).toBe(diagnostic);
  });

  test.each([
    networkPath,
    `Failed to decode ${networkPath}`,
    `Failed to decode "${networkPath}"`,
    `resource=${networkPath}`,
    `Failed to load \`${networkPath}\``,
    `Failed to load <${networkPath}>`,
  ])('redacts a boundary-delimited scheme-relative signed URL: %s', (diagnostic) => {
    const redacted = sanitizePublisherDiagnostic(diagnostic);
    expect(redacted).toContain('https://cdn.example.com/<redacted>');
    for (const secret of secrets) expect(redacted).not.toContain(secret);
  });

  test('preserves surrounding backtick and angle-bracket quotation', () => {
    expect(sanitizePublisherDiagnostic(`Failed to load \`${networkPath}\``)).toBe(
      'Failed to load `https://cdn.example.com/<redacted>`'
    );
    expect(sanitizePublisherDiagnostic(`Failed to load <${networkPath}>`)).toBe(
      'Failed to load <https://cdn.example.com/<redacted>>'
    );
  });

  test.each([
    `Failed to load ${signedUrl}`,
    `Failed to load ${networkPath}`,
    `Failed to load \`${networkPath}\``,
    `Failed to load <${networkPath}>`,
  ])('is canonical and idempotent after one, two, or four passes: %s', (diagnostic) => {
    const once = sanitizePublisherDiagnostic(diagnostic);
    const twice = sanitizePublisherDiagnostic(once);
    const fourTimes = sanitizePublisherDiagnostic(sanitizePublisherDiagnostic(twice));
    expect(twice).toBe(once);
    expect(fourTimes).toBe(once);
    expect(once.match(/<redacted>/g)).toHaveLength(1);
  });

  test.each([
    `https://cdn.example.com/<redacted>/SECRET_PATH`,
    `https://cdn.example.com/<redacted>?token=SECRET_QUERY`,
    `https://cdn.example.com/<redacted>#SECRET_FRAGMENT`,
    `https://signed-user:SECRET_PASSWORD@cdn.example.com/private/<redacted>${signedSuffix}`,
    `//signed-user:SECRET_PASSWORD@cdn.example.com/private/<redacted>${signedSuffix}`,
    `https://cdn.example.com/<redacted><redacted>${signedSuffix}`,
    `//cdn.example.com/<redacted><redacted>${signedSuffix}`,
    `https://cdn.example.com/<REDACTED>${signedSuffix}`,
    `//cdn.example.com/<REDACTED>${signedSuffix}`,
    `https://cdn.example.com/<Redacted>${signedSuffix}`,
    `//cdn.example.com/<Redacted>${signedSuffix}`,
    `https://cdn.example.com/<REDACTED><Redacted>${signedSuffix}`,
    `//cdn.example.com/<REDACTED><Redacted>${signedSuffix}`,
  ])('consumes and redacts a spoofed canonical marker with a continuing URL suffix: %s', (url) => {
    const redacted = sanitizePublisherDiagnostic(url);
    expect(redacted).toBe('https://cdn.example.com/<redacted>');
    expect(redacted.match(/<redacted>/g)).toHaveLength(1);
    for (const secret of secrets) expect(redacted).not.toContain(secret);
  });

  test('preserves only terminal canonical markers and normalizes terminal repeats', () => {
    expect(sanitizePublisherDiagnostic('https://cdn.example.com/<redacted>')).toBe(
      'https://cdn.example.com/<redacted>'
    );
    expect(sanitizePublisherDiagnostic('https://cdn.example.com/<redacted><redacted>')).toBe(
      'https://cdn.example.com/<redacted>'
    );
    for (const url of [
      'https://cdn.example.com/<REDACTED>',
      'https://cdn.example.com/<Redacted><REDACTED>',
      '//cdn.example.com/<REDACTED>',
      '//cdn.example.com/<Redacted><REDACTED>',
    ]) {
      expect(sanitizePublisherDiagnostic(url)).toBe('https://cdn.example.com/<redacted>');
    }
  });
});
