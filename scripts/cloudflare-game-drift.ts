type JsonRecord = Record<string, unknown>;
type ReadClient = { get(pathname: string): Promise<{ result: unknown; resultInfo?: JsonRecord }> };
export type GameDriftReport = { worker: string; namespaceId: string; bindingCount: number };

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Game ${label} response is invalid`);
  }
  return value as JsonRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Game ${label} response is invalid`);
  }
  return value;
}

function exact(value: unknown, expected: unknown, label: string) {
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error(`Game ${label} drift detected`);
  }
}

async function namespaces(client: ReadClient): Promise<JsonRecord[]> {
  const result: JsonRecord[] = [];
  for (let page = 1; ; page++) {
    const response = await client.get(`/workers/durable_objects/namespaces?page=${page}&per_page=1000`);
    result.push(...array(response.result, 'namespace inventory').map((value) => record(value, 'namespace')));
    const totalPages = response.resultInfo?.total_pages;
    if (!Number.isSafeInteger(totalPages) || Number(totalPages) < page) {
      throw new Error('Game namespace pagination is invalid');
    }
    if (page === totalPages) {
      return result;
    }
  }
}

function checkBindings(settings: JsonRecord, config: JsonRecord): { namespaceId: string; bindingCount: number } {
  const bindings = array(settings.bindings, 'bindings').map((value) => record(value, 'binding'));
  const names = bindings.map((binding) => binding.name).sort();
  exact(names, ['APPLICATION_ORIGIN', 'CF_VERSION_METADATA', 'CONVEX_URL', 'GAME_ROOMS', 'GIT_SHA'], 'bindings');
  const vars = record(config.vars, 'configured variables');
  for (const name of ['APPLICATION_ORIGIN', 'CONVEX_URL', 'GIT_SHA']) {
    const binding = bindings.find((value) => value.name === name)!;
    exact(binding.type, 'plain_text', `${name} binding type`);
    if (name === 'GIT_SHA') {
      if (typeof binding.text !== 'string' || !/^[0-9a-f]{40}$/u.test(binding.text)) {
        throw new Error('Game source SHA drift detected');
      }
    } else {
      exact(binding.text, vars[name], `${name} binding value`);
    }
  }
  exact(
    bindings.find((binding) => binding.name === 'CF_VERSION_METADATA')!.type,
    'version_metadata',
    'version metadata'
  );
  const room = bindings.find((binding) => binding.name === 'GAME_ROOMS')!;
  exact(room.type, 'durable_object_namespace', 'Durable Object binding type');
  if (typeof room.namespace_id !== 'string' || !/^[0-9a-f]{32}$/u.test(room.namespace_id)) {
    throw new Error('Game namespace ID is invalid');
  }
  if (room.class_name !== undefined) {
    exact(room.class_name, 'GameRoom', 'Durable Object class');
  }
  if (room.script_name !== undefined) {
    exact(room.script_name, config.name, 'Durable Object owner');
  }
  if (room.environment !== undefined) {
    exact(room.environment, 'production', 'Durable Object environment');
  }
  return { namespaceId: room.namespace_id, bindingCount: bindings.length };
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
    array(settings.compatibility_flags, 'compatibility flags').sort(),
    array(config.compatibility_flags, 'configured flags').sort(),
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
  const owned = inventory.filter((namespace) => namespace.script === worker && namespace.class === 'GameRoom');
  if (owned.length !== 1 || owned[0]!.id !== binding.namespaceId || owned[0]!.use_sqlite !== true) {
    throw new Error('Game bound namespace must be the unique GameRoom SQLite namespace owned by dunezone-game');
  }
  return { worker, ...binding };
}
