import type { ConvexBackend } from './index';

export interface Env {
  BACKEND: DurableObjectNamespace<ConvexBackend>;
  LITESTREAM: R2Bucket;
  MODULES: R2Bucket;
  FILES: R2Bucket;
  SEARCH: R2Bucket;
  EXPORTS: R2Bucket;
  IMPORTS: R2Bucket;
  VERSION: { id: string; tag: string; timestamp: string };
  INSTANCE_NAME: string;
  CONVEX_ORIGIN: string;
  LITESTREAM_SYNC_INTERVAL: string;
  SPIKE_PAUSED?: string;
  /** Convex's push-time module analysis limit; the backend's default is 4 s. */
  ISOLATE_ANALYZE_USER_TIMEOUT_SECONDS?: string;
  /** Secrets. */
  INSTANCE_SECRET: string;
  SPIKE_CONTROL_TOKEN: string;
}
