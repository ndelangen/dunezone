/**
 * The card and token data contracts live in `src/shared/assets/schema`, the server parses them, and `src/game` is browser-only renderers.
 * This re-export keeps the renderers' import paths stable.
 */
export * from '@shared/assets/schema';
