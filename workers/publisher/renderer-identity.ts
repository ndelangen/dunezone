import { rendererManifest } from './renderer-manifest.generated';

/*
 * What the Worker reads of its renderer manifest: the identity it stamps on captures and the digest it logs.
 * Only this module imports the manifest, so the hosted play closure can count a new manifest as unobserved (`scripts/lib/hosted-play-closure.ts`).
 */
export const RENDERER_IDENTITY = rendererManifest.rendererIdentity;
export const RENDERER_MANIFEST_DIGEST = rendererManifest.digest;
