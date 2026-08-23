type OrderedPlacementRequest = {
  readonly targetId: string;
  readonly afterId: string | null;
  readonly beforeId: string | null;
};

type OrderedPlacementGroup = {
  readonly key: string;
  readonly currentOrder: readonly string[];
  readonly baseOrder: readonly string[];
  readonly requests: readonly OrderedPlacementRequest[];
};

type OrderedPlacementPlan = {
  readonly key: string;
  readonly order: readonly string[];
};

type OrderedPlacementFailure =
  | { readonly kind: 'request'; readonly key: string; readonly requestIndex: number }
  | { readonly kind: 'cycle'; readonly key: string };

type OrderedPlacementBatchResult =
  | { readonly ok: true; readonly plans: readonly OrderedPlacementPlan[] }
  | { readonly ok: false; readonly failures: readonly OrderedPlacementFailure[] };

export function compareCanonicalText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function resolveRequest(
  request: OrderedPlacementRequest,
  currentOrder: readonly string[],
  batchTargetIds: ReadonlySet<string>
): OrderedPlacementRequest | undefined {
  const order = currentOrder.filter((id) => id !== request.targetId);
  const afterIndex = request.afterId === null ? -1 : order.indexOf(request.afterId);
  const beforeIndex = request.beforeId === null ? -1 : order.indexOf(request.beforeId);
  const afterAvailable = request.afterId !== null && (afterIndex >= 0 || batchTargetIds.has(request.afterId));
  const beforeAvailable = request.beforeId !== null && (beforeIndex >= 0 || batchTargetIds.has(request.beforeId));

  if (request.afterId === null && request.beforeId === null) {
    return request;
  }
  if (afterAvailable && beforeAvailable) {
    if (afterIndex >= 0 && beforeIndex >= 0 && afterIndex >= beforeIndex) {
      return undefined;
    }
    return request;
  }
  if (afterAvailable) {
    return {
      ...request,
      beforeId: afterIndex >= 0 ? (order[afterIndex + 1] ?? null) : null,
    };
  }
  if (beforeAvailable) {
    return {
      ...request,
      afterId: beforeIndex >= 0 ? (order[beforeIndex - 1] ?? null) : null,
    };
  }
  return undefined;
}

export function planAtomicPlacementBatch(groups: readonly OrderedPlacementGroup[]): OrderedPlacementBatchResult {
  const plans: OrderedPlacementPlan[] = [];
  const failures: OrderedPlacementFailure[] = [];

  for (const group of groups) {
    const batchTargetIds = new Set(group.requests.map(({ targetId }) => targetId));
    const resolvedRequests = group.requests.map((request, requestIndex) => ({
      request: resolveRequest(request, group.currentOrder, batchTargetIds),
      requestIndex,
    }));
    const unresolved = resolvedRequests.filter(({ request }) => request === undefined);
    if (unresolved.length > 0) {
      failures.push(
        ...unresolved.map(({ requestIndex }) => ({ kind: 'request' as const, key: group.key, requestIndex }))
      );
      continue;
    }
    const requests = resolvedRequests.map(({ request }) => request!);
    const nodes = [...group.baseOrder, ...requests.map(({ targetId }) => targetId)];
    const nodeSet = new Set(nodes);
    if (nodeSet.size !== nodes.length) {
      failures.push(
        ...group.requests.map((_, requestIndex) => ({ kind: 'request' as const, key: group.key, requestIndex }))
      );
      continue;
    }

    const edges = new Map(nodes.map((id) => [id, new Set<string>()]));
    const addEdge = (from: string, to: string) => {
      if (from !== to) {
        edges.get(from)?.add(to);
      }
    };
    for (let index = 1; index < group.baseOrder.length; index += 1) {
      addEdge(group.baseOrder[index - 1]!, group.baseOrder[index]!);
    }

    let invalid = false;
    requests.forEach((request, requestIndex) => {
      const { targetId, afterId, beforeId } = request;
      if (
        (afterId !== null && !nodeSet.has(afterId)) ||
        (beforeId !== null && !nodeSet.has(beforeId)) ||
        (afterId === null && beforeId === null && group.baseOrder.length > 0)
      ) {
        failures.push({ kind: 'request', key: group.key, requestIndex });
        invalid = true;
        return;
      }
      if (afterId !== null) {
        addEdge(afterId, targetId);
      }
      if (beforeId !== null) {
        addEdge(targetId, beforeId);
      }
      const afterIndex = afterId === null ? -1 : group.baseOrder.indexOf(afterId);
      if (afterId !== null && beforeId === null && afterIndex >= 0) {
        const next = group.baseOrder[afterIndex + 1];
        if (next) {
          addEdge(targetId, next);
        }
      }
      const beforeIndex = beforeId === null ? -1 : group.baseOrder.indexOf(beforeId);
      if (beforeId !== null && afterId === null && beforeIndex >= 0) {
        const previous = group.baseOrder[beforeIndex - 1];
        if (previous) {
          addEdge(previous, targetId);
        }
      }
    });
    if (invalid) {
      continue;
    }

    const indegree = new Map(nodes.map((id) => [id, 0]));
    for (const outgoing of edges.values()) {
      for (const to of outgoing) {
        indegree.set(to, (indegree.get(to) ?? 0) + 1);
      }
    }
    const ordered: string[] = [];
    while (ordered.length < nodes.length) {
      const next = nodes.filter((id) => !ordered.includes(id) && indegree.get(id) === 0).sort(compareCanonicalText)[0];
      if (!next) {
        failures.push({ kind: 'cycle', key: group.key });
        break;
      }
      ordered.push(next);
      for (const to of edges.get(next) ?? []) {
        indegree.set(to, indegree.get(to)! - 1);
      }
    }
    if (ordered.length === nodes.length) {
      plans.push({ key: group.key, order: ordered });
    }
  }

  return failures.length > 0 ? { ok: false, failures } : { ok: true, plans };
}
