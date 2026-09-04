import { rulebookEditionArtifactPath, rulebookLatestHtmlPath } from '../src/shared/rulebooks/editionArtifacts';
import { APPLICATION_ORIGIN, PUBLISHER_PRODUCTION_CONVEX_URL } from './publisher-deployment-contract';

/**
 * The read-only half of the Rulebook production-confidence path.
 * Norbert creates, edits, saves, and publishes a real Rulebook through the application;
 * this script then proves what readers and crawlers get from production for it, one Edition at a time, and writes the evidence as JSON.
 * It never writes, so it can run as often as wanted against production.
 */

type Readiness = { status: 'preparing' | 'ready' | 'failed'; href: string | null };
type Edition = { edition_number: number; created_at: string; html: Readiness; pdf: Readiness };
type Finding = { check: string; ok: boolean; detail: string };

export type LiveCheckClient = {
  query: (path: string, args: Record<string, unknown>) => Promise<unknown>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  origin: string;
};

export type LiveCheckReport = {
  rulesetSlug: string;
  rulebookSlug: string;
  rulebook: { id: string; name: string; currentEdition: number } | null;
  editions: Edition[];
  findings: Finding[];
};

const EDITION_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const LATEST_CACHE_CONTROL = 'public, max-age=0, must-revalidate';

type Ledger = {
  note: (check: string, ok: boolean, detail: string) => void;
  headerIs: (check: string, response: Response, name: string, expected: string | null) => void;
};

function ledger(findings: Finding[]): Ledger {
  const note: Ledger['note'] = (check, ok, detail) => findings.push({ check, ok, detail });
  return {
    note,
    headerIs: (check, response, name, expected) => {
      const actual = response.headers.get(name);
      note(check, actual === expected, `${name}: ${actual ?? 'absent'}, expected ${expected ?? 'absent'}`);
    },
  };
}

/** One permanent artifact path answers for its readiness: a 404 while not ready, the full delivery contract once ready. */
async function checkEditionArtifact(
  client: LiveCheckClient,
  { note, headerIs }: Ledger,
  rulebookId: string,
  edition: Edition,
  kind: 'html' | 'pdf'
) {
  const readiness = edition[kind];
  const path = rulebookEditionArtifactPath(rulebookId, edition.edition_number, kind);
  const check = `Edition ${edition.edition_number} ${kind.toUpperCase()}`;
  if (readiness.status !== 'ready') {
    const response = await client.fetch(`${client.origin}${path}`);
    note(`${check} ${readiness.status}`, response.status === 404, `HTTP ${response.status} while ${readiness.status}`);
    headerIs(`${check} ${readiness.status} cache`, response, 'cache-control', 'no-store');
    return;
  }
  note(`${check} href`, readiness.href === path, `href ${readiness.href ?? 'null'}`);
  const first = await client.fetch(`${client.origin}${path}`);
  note(`${check} ready`, first.status === 200, `HTTP ${first.status}`);
  headerIs(`${check} cache`, first, 'cache-control', EDITION_CACHE_CONTROL);
  headerIs(`${check} robots`, first, 'x-robots-tag', 'noindex');
  headerIs(`${check} type`, first, 'content-type', kind === 'html' ? 'text/html; charset=utf-8' : 'application/pdf');
  if (kind === 'html') {
    const canonical = `<${new URL(rulebookLatestHtmlPath(rulebookId), client.origin).href}>; rel="canonical"`;
    headerIs(`${check} canonical`, first, 'link', canonical);
  } else {
    headerIs(`${check} disposition`, first, 'content-disposition', 'attachment; filename="rulebook.pdf"');
  }
  const second = await client.fetch(`${client.origin}${path}`, { method: 'HEAD' });
  note(
    `${check} permanence`,
    second.status === 200 && second.headers.get('etag') === first.headers.get('etag'),
    `ETag ${first.headers.get('etag') ?? 'absent'} then ${second.headers.get('etag') ?? 'absent'}`
  );
  const refused = await client.fetch(`${client.origin}${path}`, { method: 'POST' });
  note(`${check} method gate`, refused.status === 405, `POST HTTP ${refused.status}`);
}

/** The one indexable latest HTML view, and the latest PDF alias that must not exist. */
async function checkLatestViews(
  client: LiveCheckClient,
  { note, headerIs }: Ledger,
  rulebookId: string,
  editions: Edition[]
) {
  const latestReady = editions.find((edition) => edition.html.status === 'ready');
  const latest = await client.fetch(`${client.origin}${rulebookLatestHtmlPath(rulebookId)}`);
  note('latest HTML', latest.status === (latestReady ? 200 : 404), `HTTP ${latest.status}`);
  if (latestReady) {
    headerIs('latest HTML cache', latest, 'cache-control', LATEST_CACHE_CONTROL);
    headerIs('latest HTML robots', latest, 'x-robots-tag', null);
    headerIs(
      'latest HTML content',
      latest,
      'content-location',
      rulebookEditionArtifactPath(rulebookId, latestReady.edition_number, 'html')
    );
  }
  const pdfAlias = await client.fetch(`${client.origin}/published/rulebooks/${rulebookId}/rulebook.pdf`);
  note('no latest PDF alias', pdfAlias.status === 404, `HTTP ${pdfAlias.status}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  const isObject = typeof value === 'object' && value !== null;
  return isObject && !Array.isArray(value);
}

function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${what} is not an array`);
  }
  return value;
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${what} is not an object`);
  }
  return value;
}

export function productionClient(): LiveCheckClient {
  return {
    origin: APPLICATION_ORIGIN,
    fetch: (url, init) => fetch(url, { ...init, redirect: 'manual' }),
    query: async (path, args) => {
      const response = await fetch(`${PUBLISHER_PRODUCTION_CONVEX_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, args, format: 'json' }),
      });
      const body = asRecord(await response.json(), `${path} response`);
      if (body.status !== 'success') {
        throw new Error(`${path} failed: ${String(body.errorMessage ?? body.status)}`);
      }
      return body.value;
    },
  };
}

/** The application routes and the reader answer for every Edition, and each Edition's permanent files answer for their readiness. */
type ReaderTarget = { rulesetSlug: string; rulebookSlug: string; rulebookId: string };

async function checkReaders(client: LiveCheckClient, book: Ledger, target: ReaderTarget, editions: Edition[]) {
  const { note } = book;
  const { rulesetSlug, rulebookSlug, rulebookId } = target;
  const appPath = `/rulesets/${rulesetSlug}/rulebooks/${rulebookSlug}`;
  for (const path of [`/rulesets/${rulesetSlug}`, appPath, `${appPath}/editions`]) {
    const response = await client.fetch(`${client.origin}${path}`);
    note(`app ${path}`, response.status === 200, `HTTP ${response.status}`);
  }

  for (const edition of editions) {
    const label = `Edition ${edition.edition_number}`;
    const reader = asRecord(
      await client.query('rulebooks:readerPage', {
        ruleset_slug: rulesetSlug,
        rulebook_slug: rulebookSlug,
        edition_number: edition.edition_number,
      }),
      `${label} reader`
    );
    const readerEdition = asRecord(reader.edition, `${label} reader edition`);
    note(
      `${label} reader`,
      readerEdition.edition_number === edition.edition_number,
      `reader serves Edition ${String(readerEdition.edition_number)}`
    );
    const readerRoute = await client.fetch(`${client.origin}${appPath}?edition=${edition.edition_number}`);
    note(`${label} reader route`, readerRoute.status === 200, `HTTP ${readerRoute.status}`);

    for (const kind of ['html', 'pdf'] as const) {
      await checkEditionArtifact(client, book, rulebookId, edition, kind);
    }
  }
}

/** Every reader and crawler contract one Rulebook must meet on production, as one report. */
export async function checkRulebookLive(
  client: LiveCheckClient,
  rulesetSlug: string,
  rulebookSlug: string
): Promise<LiveCheckReport> {
  const findings: Finding[] = [];
  const book = ledger(findings);
  const { note } = book;

  const listing = asArray(
    await client.query('rulebooks:listByRulesetSlug', { ruleset_slug: rulesetSlug }),
    'listing'
  ).map((entry, index) => asRecord(entry, `listing entry ${index}`));
  const listed = listing.find((entry) => entry.slug === rulebookSlug);
  if (!listed) {
    note('listing', false, `Ruleset ${rulesetSlug} lists ${listing.length} Rulebooks and none is ${rulebookSlug}`);
    return { rulesetSlug, rulebookSlug, rulebook: null, editions: [], findings };
  }
  const rulebook = {
    id: String(listed._id),
    name: String(listed.name),
    currentEdition: Number(listed.current_edition_number),
  };
  note('listing', true, `${rulebook.name} listed at Edition ${rulebook.currentEdition}`);

  const history = asRecord(
    await client.query('rulebooks:editionHistory', { ruleset_slug: rulesetSlug, rulebook_slug: rulebookSlug }),
    'edition history'
  );
  const editions = asArray(history.editions, 'edition history editions') as Edition[];
  note(
    'history',
    editions[0]?.edition_number === rulebook.currentEdition,
    `${editions.length} Editions, newest ${editions[0]?.edition_number ?? 'none'}`
  );
  note(
    'listing readiness',
    JSON.stringify(listed.html) === JSON.stringify(editions[0]?.html) &&
      JSON.stringify(listed.pdf) === JSON.stringify(editions[0]?.pdf),
    'the card and the history agree on the current Edition files'
  );

  await checkReaders(client, book, { rulesetSlug, rulebookSlug, rulebookId: rulebook.id }, editions);
  await checkLatestViews(client, book, rulebook.id, editions);

  return { rulesetSlug, rulebookSlug, rulebook, editions, findings };
}

if (import.meta.main) {
  const [rulesetSlug, rulebookSlug] = process.argv.slice(2);
  if (!rulesetSlug || !rulebookSlug) {
    console.error('Usage: bun run ./scripts/rulebook-live-check.ts <ruleset-slug> <rulebook-slug>');
    process.exit(2);
  }
  const report = await checkRulebookLive(productionClient(), rulesetSlug, rulebookSlug);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const failed = report.findings.filter((finding) => !finding.ok);
  if (!report.rulebook) {
    console.error('Nothing to verify: the Rulebook is absent from production, see the listing finding above.');
    process.exit(2);
  }
  if (failed.length > 0) {
    console.error(`${failed.length} live checks failed.`);
    process.exit(1);
  }
  console.log(`All ${report.findings.length} live checks passed for ${report.rulebook.name}.`);
}
