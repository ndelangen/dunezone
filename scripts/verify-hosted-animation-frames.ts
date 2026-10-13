type AnimationFrameProgress = {
  requested: number;
  delivered: number;
  cancelled: number;
  pending: number;
  oldestPendingMs: number | null;
  lastDeliveredAgoMs: number | null;
  maxCallbackDurationMs: number;
};

declare global {
  interface Window {
    hostedPlayAnimationFrames?: () => AnimationFrameProgress;
  }
}

/** Records frame delivery without requesting extra frames or changing callback results. */
export function observeAnimationFrameProgress() {
  const request = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  const pending = new Map<number, number>();
  let requested = 0;
  let delivered = 0;
  let cancelled = 0;
  let lastDeliveredAt: number | null = null;
  let maxCallbackDurationMs = 0;

  window.requestAnimationFrame = (callback) => {
    if (typeof callback !== 'function') {
      return request(callback);
    }
    requested += 1;
    const handle = request((time) => {
      pending.delete(handle);
      delivered += 1;
      const startedAt = performance.now();
      lastDeliveredAt = startedAt;
      try {
        callback.call(window, time);
      } finally {
        maxCallbackDurationMs = Math.max(maxCallbackDurationMs, performance.now() - startedAt);
      }
    });
    pending.set(handle, performance.now());
    return handle;
  };
  window.cancelAnimationFrame = (handle) => {
    if (pending.delete(handle)) {
      cancelled += 1;
    }
    cancel(handle);
  };
  window.hostedPlayAnimationFrames = () => {
    const now = performance.now();
    let oldestPendingMs: number | null = null;
    for (const startedAt of pending.values()) {
      oldestPendingMs = Math.max(oldestPendingMs ?? 0, now - startedAt);
    }
    return {
      requested,
      delivered,
      cancelled,
      pending: pending.size,
      oldestPendingMs,
      lastDeliveredAgoMs: lastDeliveredAt === null ? null : now - lastDeliveredAt,
      maxCallbackDurationMs,
    };
  };
}
