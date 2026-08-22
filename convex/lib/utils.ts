export function nowIso() {
  return new Date().toISOString();
}

export { slugify } from '../../src/shared/slugify';

export function ensureObject(value: unknown) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected an object');
  }
  return value as Record<string, unknown>;
}
