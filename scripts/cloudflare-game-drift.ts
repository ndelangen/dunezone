type JsonRecord = Record<string, unknown>;
type ReadClient = { get(pathname: string): Promise<{ result: unknown; resultInfo?: JsonRecord }> };
export type GameDriftReport = { worker: string; namespaceId: string; bindingCount: number };

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`Game ${label} response is invalid`);
  }
  if (Array.isArray(value)) {
    throw new TypeError(`Game ${label} response is invalid`);
  }
  return value as JsonRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Game ${label} response is invalid`);
  }
  return value;
}

function sortedStrings(value: unknown, label: string): string[] {
  return array(value, label)
    .map((item) => {
      if (typeof item !== 'string') {
        throw new TypeError(`Game ${label} must contain only strings`);
      }
      return item;
    })
    .sort((left, right) => left.localeCompare(right));
}

function exact(value: unknown, expected: unknown, label: string) {
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error(`Game ${label} drift detected`);
  }
}

async function namespaces(client: ReadClient): Promise<JsonRecord[]> {
  const result: JsonRecord[] = [];
  let extent: ReturnType<typeof namespacePage>['extent'] | undefined;
  for (let page = 1; ; page++) {
    const response = await client.get(`/workers/durable_objects/namespaces?page=${page}&per_page=1000`);
    const inventory = namespacePage(response, page);
    extent ??= inventory.extent;
    exact(inventory.extent, extent, 'namespace pagination');
    result.push(...inventory.namespaces);
    if (page === extent.totalPages) {
      if (typeof extent.totalCount === 'number') {
        exact(result.length, extent.totalCount, 'namespace inventory count');
      }
      return result;
    }
  }
}

function namespacePage(response: Awaited<ReturnType<ReadClient['get']>>, page: number) {
  const entries = array(response.result, 'namespace inventory').map((value) => record(value, 'namespace'));
  const info = response.resultInfo;
  const totalPages = namespacePageCount(info, page, entries.length);
  return {
    namespaces: entries,
    extent: { totalPages, totalCount: info?.total_count, perPage: info?.per_page },
  };
}

function namespacePageCount(info: JsonRecord | undefined, page: number, count: number): number {
  const totalPages = info?.total_pages;
  const perPage = info?.per_page;
  const total = info?.total_count;
  const deriving = totalPages === undefined;
  if (
    ((deriving || info?.page !== undefined) && info?.page !== page) ||
    ((deriving || info?.count !== undefined) && info?.count !== count)
  ) {
    throw new Error('Game namespace pagination is invalid');
  }
  for (const [value, minimum, maximum] of [
    [perPage, 1, 1000],
    [total, 0, Number.MAX_SAFE_INTEGER],
    [totalPages, page, Number.MAX_SAFE_INTEGER],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum)) {
      throw new Error('Game namespace pagination is invalid');
    }
  }
  if (typeof perPage === 'number' && typeof total === 'number') {
    const expectedCount = Math.min(perPage, Math.max(0, total - (page - 1) * perPage));
    if (count !== expectedCount) {
      throw new Error('Game namespace inventory is incomplete');
    }
    const derivedPages = Math.max(1, Math.ceil(total / perPage));
    if (totalPages !== undefined) {
      exact(totalPages, derivedPages, 'namespace pagination');
    }
    if (derivedPages < page) {
      throw new Error('Game namespace pagination is invalid');
    }
    return derivedPages;
  }
  if (deriving || (typeof perPage === 'number' && count > perPage)) {
    throw new Error('Game namespace pagination is invalid');
  }
  return Number(totalPages);
}

function checkVariables(bindings: JsonRecord[], vars: JsonRecord): void {
  for (const name of ['APPLICATION_ORIGIN', 'CONVEX_URL', 'GIT_SHA']) {
    const binding = bindings.find((value) => value.name === name)!;
    checkVariable(binding, { name, expected: vars[name] });
  }
}

function checkVariable(binding: JsonRecord, variable: { name: string; expected: unknown }) {
  exact(binding.type, 'plain_text', `${variable.name} binding type`);
  if (variable.name === 'GIT_SHA') {
    if (typeof binding.text !== 'string' || !/^[0-9a-f]{40}$/u.test(binding.text)) {
      throw new Error('Game source SHA drift detected');
    }
  } else {
    exact(binding.text, variable.expected, `${variable.name} binding value`);
  }
}

function checkRoomBinding(room: JsonRecord, config: JsonRecord): string {
  exact(room.type, 'durable_object_namespace', 'Durable Object binding type');
  if (typeof room.namespace_id !== 'string' || !/^[0-9a-f]{32}$/u.test(room.namespace_id)) {
    throw new Error('Game namespace ID is invalid');
  }
  for (const [field, expected] of Object.entries({
    class_name: 'GameRoom',
    script_name: config.name,
    environment: 'production',
  })) {
    if (room[field] !== undefined) {
      exact(room[field], expected, `Durable Object ${field}`);
    }
  }
  return room.namespace_id;
}

function checkBindings(settings: JsonRecord, config: JsonRecord): { namespaceId: string; bindingCount: number } {
  const bindings = array(settings.bindings, 'bindings').map((value) => record(value, 'binding'));
  const names = sortedStrings(
    bindings.map((binding) => binding.name),
    'binding names'
  );
  exact(names, ['APPLICATION_ORIGIN', 'CF_VERSION_METADATA', 'CONVEX_URL', 'GAME_ROOMS', 'GIT_SHA'], 'bindings');
  checkVariables(bindings, record(config.vars, 'configured variables'));
  exact(
    bindings.find((binding) => binding.name === 'CF_VERSION_METADATA')!.type,
    'version_metadata',
    'version metadata'
  );
  const room = bindings.find((binding) => binding.name === 'GAME_ROOMS')!;
  return { namespaceId: checkRoomBinding(room, config), bindingCount: bindings.length };
}

function checkOwnedNamespace(inventory: JsonRecord[], binding: Pick<GameDriftReport, 'worker' | 'namespaceId'>) {
  const owned = inventory.filter((namespace) => namespace.script === binding.worker && namespace.class === 'GameRoom');
  exact(owned.length, 1, 'owned GameRoom namespaces');
  const [namespace] = owned;
  if (namespace!.id !== binding.namespaceId || namespace!.use_sqlite !== true) {
    throw new Error('Game bound namespace must be the unique GameRoom SQLite namespace owned by dunezone-game');
  }
}

/** Proves the private Worker owns its bound SQLite namespace before the publisher routes traffic to it. */
export async function auditGameWorker(client: ReadClient, config: JsonRecord): Promise<GameDriftReport> {
  if (config.name !== 'dunezone-game') {
    throw new Error('Game Worker name differs from the deployment contract');
  }
  const worker = config.name;
  const [settingsResult, secrets, schedules, domains, subdomain, routes, inventory] = await Promise.all([
    client.get(`/workers/scripts/${worker}/settings`),
    client.get(`/workers/scripts/${worker}/secrets`),
    client.get(`/workers/scripts/${worker}/schedules`),
    client.get(`/workers/domains?service=${worker}`),
    client.get(`/workers/scripts/${worker}/subdomain`),
    client.get(`/workers/services/${worker}/environments/production/routes?show_zonename=true`),
    namespaces(client),
  ]);
  const settings = record(settingsResult.result, 'settings');
  const binding = checkBindings(settings, config);
  exact(settings.compatibility_date, config.compatibility_date, 'compatibility date');
  exact(
    sortedStrings(settings.compatibility_flags, 'compatibility flags'),
    sortedStrings(config.compatibility_flags, 'configured flags'),
    'compatibility flags'
  );
  exact(record(settings.limits, 'limits').cpu_ms, record(config.limits, 'configured limits').cpu_ms, 'CPU limit');
  exact(array(secrets.result, 'secrets'), [], 'secrets');
  exact(array(record(schedules.result, 'schedules').schedules, 'schedules'), [], 'schedules');
  exact(array(domains.result, 'Custom Domains'), [], 'Custom Domains');
  exact(array(routes.result, 'routes'), [], 'routes');
  const ingress = record(subdomain.result, 'workers.dev ingress');
  exact(ingress.enabled, false, 'workers.dev ingress');
  exact(ingress.previews_enabled, false, 'preview ingress');
  checkOwnedNamespace(inventory, { worker, namespaceId: binding.namespaceId });
  return { worker, ...binding };
}
