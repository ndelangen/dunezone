import { describe, expect, test } from 'vitest';

import { userImagePublicPath } from '../../src/shared/user-images/contract';
import type { SnapshotManifest } from './snapshot-anonymiser';
import {
  anonymiseExport,
  encodeDocumentId,
  SNAPSHOT_MANIFEST,
  scanSnapshot,
  SnapshotRefused,
  tableNumberOfId,
  verifySnapshot,
} from './snapshot-anonymiser';
import { snapshotPolicy } from './snapshot-policy';

type Row = Record<string, unknown>;

/*
 * The component entries a local backend export wrote for this app's components (#1566), with `homepageCommunity`,
 * which production still holds, in the same aggregate layout. The file names are the export's; the contents are made up.
 */
const COMPONENT_TABLES = {
  migrations: ['migrations'],
  rateLimiter: ['rateLimits'],
  statistics: ['btree', 'btreeNode'],
  profileDiscovery: ['btree', 'btreeNode'],
  profileActivity: ['btree', 'btreeNode'],
  homepageCommunity: ['btree', 'btreeNode'],
};

function componentEntries(prefix: string, tables: readonly string[]): [string, string][] {
  return [
    [
      `${prefix}_tables/documents.jsonl`,
      tables.map((name, index) => `{"name":"${name}","id":${10_001 + index}}\n`).join(''),
    ],
    ...tables.flatMap((table): [string, string][] => [
      [`${prefix}${table}/documents.jsonl`, '{"_id":"x","_creationTime":1,"value":1}\n'],
      [`${prefix}${table}/generated_schema.jsonl`, '"uniform"'],
    ]),
  ];
}

/** A synthetic export in `convex export` layout. Every value is made up here. */
function syntheticExport() {
  const tableNumbers = new Map(Object.keys(snapshotPolicy).map((table, index) => [table, 10_001 + index]));
  const rows = new Map<string, Row[]>();
  let next = 0;
  const numberOf = (table: string) => {
    if (!tableNumbers.has(table)) {
      tableNumbers.set(table, 10_001 + tableNumbers.size);
    }
    return tableNumbers.get(table)!;
  };
  return {
    add(table: string, fields: Row): string {
      next += 1;
      const internalId = new Uint8Array(16);
      internalId[15] = next;
      const _id = encodeDocumentId(numberOf(table), internalId);
      rows.set(table, [...(rows.get(table) ?? []), { _id, _creationTime: 1_700_000_000_000 + next, ...fields }]);
      return _id;
    },
    patch(table: string, id: string, fields: Row) {
      rows.set(
        table,
        (rows.get(table) ?? []).map((row) => (row._id === id ? { ...row, ...fields } : row))
      );
    },
    numberOf,
    entries(extra: Record<string, string> = {}): Map<string, string> {
      const entries = new Map<string, string>([
        ['README.md', '# Welcome to your Convex snapshot export!\n'],
        [
          '_tables/documents.jsonl',
          [...tableNumbers].map(([name, id]) => `${JSON.stringify({ name, id })}\n`).join(''),
        ],
      ]);
      for (const table of tableNumbers.keys()) {
        entries.set(
          `${table}/documents.jsonl`,
          (rows.get(table) ?? []).map((row) => `${JSON.stringify(row)}\n`).join('')
        );
        entries.set(`${table}/generated_schema.jsonl`, '"uniform"\n');
      }
      for (const [component, tables] of Object.entries(COMPONENT_TABLES)) {
        for (const [path, text] of componentEntries(`_components/${component}/`, tables)) {
          entries.set(path, text);
        }
      }
      for (const [path, text] of Object.entries(extra)) {
        entries.set(path, text);
      }
      return entries;
    },
  };
}

const timestamps = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' };

/** One author with a published faction, ruleset and question, and the private and deleted rows around them. */
function authorWorld() {
  const world = syntheticExport();
  const author = world.add('users', { name: 'Author', email: 'author@example.com' });
  world.add('authAccounts', { userId: author, provider: 'password', providerAccountId: 'author@example.com' });
  const created_at = timestamps.created_at;
  const group = world.add('groups', {
    name: 'Council',
    slug: 'council',
    created_by: author,
    is_deleted: false,
    created_at,
  });
  const deletedGroup = world.add('groups', {
    name: 'Old',
    slug: 'old',
    created_by: author,
    is_deleted: true,
    created_at,
  });
  world.add('group_members', { group_id: group, user_id: author, status: 'active' });
  world.add('profiles', {
    user_id: author,
    username: 'author',
    avatar_url: null,
    default_group_id: group,
    account_state: 'active',
    slug: 'author',
    ...timestamps,
  });
  const leaving = world.add('users', { name: 'Leaving', email: 'leaving@example.com' });
  world.add('profiles', {
    user_id: leaving,
    username: 'leaving',
    avatar_url: null,
    account_state: 'deletion_pending',
    slug: 'leaving',
    ...timestamps,
  });
  const faction = (fields: Row) =>
    world.add('factions', {
      owner_id: author,
      data: { name: 'Fremen' },
      slug: 'fremen',
      is_deleted: false,
      ...timestamps,
      ...fields,
    });
  const published = faction({ group_id: deletedGroup });
  const deleted = faction({ slug: 'gone', is_deleted: true, group_id: null });
  const ruleset = world.add('rulesets', {
    name: 'Classic',
    slug: 'classic',
    about: '',
    owner_id: author,
    group_id: group,
    is_deleted: false,
    image_cover: null,
    ...timestamps,
  });
  world.add('ruleset_factions', { ruleset_id: ruleset, faction_id: published });
  world.add('ruleset_factions', { ruleset_id: ruleset, faction_id: deleted });
  const question = world.add('faq_items', {
    ruleset_id: ruleset,
    slug: '1',
    question: 'Can the Fremen ride worms?',
    asked_by: author,
    accepted_answer_id: null,
    ...timestamps,
  });
  const answer = world.add('faq_answers', {
    faq_item_id: question,
    answer: 'Yes',
    answered_by: author,
    created_at,
  });
  world.patch('faq_items', question, { accepted_answer_id: answer });
  return { world, author, group, published, deleted, ruleset, question, faction };
}

const COVER_URL = `https://dune.zone${userImagePublicPath(`${'a'.repeat(64)}.jpg`)}`;
/* The signed source `convex/rulebooks.coverImages.test.ts` plants: no run of hex, so only the projection keeps it out. */
const SIGNED_SOURCE = 'https://images.example/cover.png?signature=private-cover-secret&expires=9999999999';

/** Edition Contents whose one Cover holds a rehosted image fetched from a signed source. */
function signedCoverContents() {
  return {
    schemaVersion: 1,
    pageOrder: ['CVER'],
    pagesById: {
      CVER: {
        id: 'CVER',
        anchor: 'cover',
        title: 'Cover',
        layoutId: 'cover',
        showHeading: true,
        controlValues: {
          cover: {
            subtitle: '',
            supportingText: '',
            showDuneLogo: true,
            backgroundImageUrl: SIGNED_SOURCE,
            backgroundImage: { url: COVER_URL, sourceUrl: SIGNED_SOURCE, width: 1100, height: 1600 },
          },
        },
        blockOrderByRegion: {},
        blocksById: {},
      },
    },
  };
}

/** The author's ruleset with a Rulebook: a legacy Edition holding its Contents inline, and a current one with a Contents row. */
function rulebookWorld() {
  const authored = authorWorld();
  const { world, author, ruleset } = authored;
  const rulebook = world.add('rulebooks', {
    ruleset_id: ruleset,
    name: 'Manual',
    name_key: 'manual',
    slug: 'manual',
    sort_order: 0,
    current_edition_number: 2,
    created_by: author,
    is_deleted: false,
    ...timestamps,
  });
  const edition = (fields: Row) =>
    world.add('rulebook_editions', {
      rulebook_id: rulebook,
      created_by: author,
      created_at: timestamps.created_at,
      ...fields,
    });
  const legacy = edition({ edition_number: 1, contents: signedCoverContents() });
  const current = edition({ edition_number: 2 });
  world.add('rulebook_edition_contents', { edition_id: current, contents: signedCoverContents() });
  return { ...authored, rulebook, legacy, current };
}

function rowsOf(entries: ReadonlyMap<string, string>, table: string): Row[] {
  return (entries.get(`${table}/documents.jsonl`) ?? '')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Row);
}

function manifestOf(entries: ReadonlyMap<string, string>): SnapshotManifest {
  return JSON.parse(entries.get(SNAPSHOT_MANIFEST)!) as SnapshotManifest;
}

/** The snapshot with one table's rows replaced, or its entry removed with null, and the manifest's count kept in step. */
function withRows(entries: ReadonlyMap<string, string>, table: string, rows: readonly Row[] | null) {
  const manifest = manifestOf(entries);
  const changed = new Map(entries);
  if (rows === null) {
    changed.delete(`${table}/documents.jsonl`);
    delete manifest.rows[table];
  } else {
    changed.set(`${table}/documents.jsonl`, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
    manifest.rows[table] = rows.length;
  }
  return changed.set(SNAPSHOT_MANIFEST, JSON.stringify(manifest));
}

function refusal(run: () => unknown): SnapshotRefused {
  try {
    run();
  } catch (error) {
    if (error instanceof SnapshotRefused) {
      return error;
    }
    throw error;
  }
  throw new Error('The anonymiser accepted an export it should have refused');
}

describe('anonymiseExport', () => {
  test('drops unpublished rows, private tables and rows whose parent was dropped', () => {
    const { world, published, question } = authorWorld();
    const { entries } = anonymiseExport(world.entries());

    expect(rowsOf(entries, 'factions').map((row) => row._id)).toEqual([published]);
    expect(rowsOf(entries, 'groups').map((row) => row.slug)).toEqual(['council']);
    expect(rowsOf(entries, 'ruleset_factions').map((row) => row.faction_id)).toEqual([published]);
    expect(rowsOf(entries, 'profiles').map((row) => row.slug)).toEqual(['snapshot-owner']);
    expect(rowsOf(entries, 'faq_items').map((row) => row._id)).toEqual([question]);
    for (const table of ['authAccounts', 'group_members', 'faq_answers']) {
      expect(entries.has(`${table}/documents.jsonl`)).toBe(false);
    }
    expect([...entries.keys()].filter((path) => path.startsWith('_components/') || path === 'README.md')).toEqual([]);
  });

  test('points user references at the placeholder owner and nulls references to dropped rows', () => {
    const { world, group } = authorWorld();
    const { entries } = anonymiseExport(world.entries());
    const { userId, profileId } = manifestOf(entries).placeholderOwner;

    expect(tableNumberOfId(userId)).toBe(world.numberOf('users'));
    expect(tableNumberOfId(profileId)).toBe(world.numberOf('profiles'));
    expect(rowsOf(entries, 'users')).toEqual([expect.objectContaining({ _id: userId })]);
    expect(rowsOf(entries, 'profiles')).toEqual([expect.objectContaining({ _id: profileId, user_id: userId })]);
    expect(rowsOf(entries, 'factions')[0]).toMatchObject({ owner_id: userId, group_id: null });
    expect(rowsOf(entries, 'rulesets')[0]).toMatchObject({ owner_id: userId, group_id: group });
    expect(rowsOf(entries, 'groups')[0]).toMatchObject({ created_by: userId });
    expect(rowsOf(entries, 'faq_items')[0]).toMatchObject({ asked_by: userId, accepted_answer_id: null });
  });

  test('drops the tables that left the schema by name, and still fails on a table in neither list', () => {
    const { world } = authorWorld();
    world.add('asset_rollouts', { renderer_version: 'planted-renderer' });
    world.add('asset_targets', { target_key: 'planted-target' });
    world.add('mystery', { value: 1 });
    world.add('another_mystery', { value: 2 });

    const error = refusal(() => anonymiseExport(world.entries({ '_storage/kg2abc': 'bytes' })));

    expect(error.problems).toEqual([
      'unexpected entries:\n  - _storage/kg2abc',
      'tables the snapshot policy does not classify:\n  - another_mystery\n  - mystery',
    ]);

    const { world: retiredOnly } = authorWorld();
    retiredOnly.add('asset_rollouts', { renderer_version: 'planted-renderer' });
    const { entries, report } = anonymiseExport(retiredOnly.entries());
    expect(entries.has('asset_rollouts/documents.jsonl')).toBe(false);
    expect([...entries.values()].join('\n')).not.toContain('planted-renderer');
    expect(report.tables.find(({ table }) => table === 'asset_rollouts')).toMatchObject({
      dropReason: 'retired asset publisher bookkeeping, not content',
      rowsIn: 1,
      rowsOut: 0,
    });
  });

  test('fails on a field the policy does not classify, without repeating its value', () => {
    const { world, faction } = authorWorld();
    faction({ slug: 'notes', notes: 'meet me behind the spice silo' });

    const error = refusal(() => anonymiseExport(world.entries()));

    expect(error.problems).toEqual(['factions: fields the snapshot policy does not classify:\n  - notes']);
    expect(error.message).not.toContain('spice silo');
  });

  test('the leak scan stops a planted email and token in published content, without repeating them', () => {
    const { world, faction } = authorWorld();
    const token = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c2lnbmF0dXJlLXNpZ25hdHVyZQ';
    faction({ slug: 'leaky', data: { name: 'Leaky', lore: ['write to muad.dib@arrakis.example', { note: token }] } });

    const error = refusal(() => anonymiseExport(world.entries()));

    expect(error.problems).toEqual(['leak scan: email in factions.data', 'leak scan: token in factions.data']);
    expect(error.message).not.toContain('muad.dib');
    expect(error.message).not.toContain(token);
  });
});

describe('anonymiseExport on Rulebook Editions', () => {
  test('shows Edition Contents the way the public reader does, so a signed cover source stays in production', () => {
    const { world, legacy, current } = rulebookWorld();
    const { entries } = anonymiseExport(world.entries());
    const publicCover = {
      backgroundImageUrl: COVER_URL,
      backgroundImage: { url: COVER_URL, sourceUrl: COVER_URL, width: 1100, height: 1600 },
    };

    expect([...entries.values()].join('\n')).not.toContain('private-cover-secret');
    const [legacyEdition, currentEdition] = rowsOf(entries, 'rulebook_editions');
    const [stored] = rowsOf(entries, 'rulebook_edition_contents');
    expect(legacyEdition).toMatchObject({ _id: legacy });
    expect(currentEdition).not.toHaveProperty('contents');
    expect(stored).toMatchObject({ edition_id: current });
    for (const contents of [legacyEdition!.contents, stored!.contents]) {
      expect(contents).toMatchObject({ pagesById: { CVER: { controlValues: { cover: publicCover } } } });
    }
  });

  test('refuses Contents the public reader cannot read, without repeating them', () => {
    const { world, current } = rulebookWorld();
    world.add('rulebook_edition_contents', { edition_id: current, contents: { secret_draft: 'the spice silo plan' } });

    const error = refusal(() => anonymiseExport(world.entries()));

    expect(error.problems).toEqual(['rulebook_edition_contents: 1 rows whose contents the snapshot cannot project']);
    expect(error.message).not.toContain('spice silo');
  });

  test('drops a row that lacks the reference its parent rule reads', () => {
    const { world, ruleset, published } = rulebookWorld();
    world.add('ruleset_factions', { ruleset_id: ruleset });
    world.add('rulebook_edition_contents', { contents: { secret_draft: 'the spice silo plan' } });

    const { entries } = anonymiseExport(world.entries());

    expect(rowsOf(entries, 'ruleset_factions').map((row) => row.faction_id)).toEqual([published]);
    expect(rowsOf(entries, 'rulebook_edition_contents')).toHaveLength(1);
    expect([...entries.values()].join('\n')).not.toContain('spice silo');
  });

  test('reads the policy and field names as own keys, so Object members classify nothing', () => {
    const { world, faction } = authorWorld();
    faction({ slug: 'members', constructor: 'x', toString: 'y' });
    world.add('constructor', { value: 1 });

    const { problems } = refusal(() => anonymiseExport(world.entries()));

    expect(problems).toEqual([
      'tables the snapshot policy does not classify:\n  - constructor',
      'factions: fields the snapshot policy does not classify:\n  - constructor\n  - toString',
    ]);
  });
});

describe('anonymiseExport on component data', () => {
  test('drops every installed and retired component by name, nested components included', () => {
    const { world } = authorWorld();
    const nested = Object.fromEntries(componentEntries('_components/statistics/_components/shards/', ['btree']));

    const { entries, report } = anonymiseExport(world.entries(nested));

    expect([...entries.keys()].filter((path) => path.startsWith('_components/'))).toEqual([]);
    expect(report.droppedComponents).toEqual(
      ['homepageCommunity', 'migrations', 'profileActivity', 'profileDiscovery', 'rateLimiter', 'statistics'].map(
        (component) => ({ component, dropReason: expect.any(String) })
      )
    );
  });

  test('refuses a component the policy does not name and an entry outside the component layout', () => {
    const { world } = authorWorld();
    const extra = {
      ...Object.fromEntries(componentEntries('_components/newcomer/', ['items'])),
      '_components/constructor/_tables/documents.jsonl': '',
      '_components/Statistics/btree/documents.jsonl': '',
      '_components/statisticsX/btree/documents.jsonl': '',
      '_components/statistics/btree/documents.jsonl.bak': '',
      'x_components/statistics/btree/documents.jsonl': '',
      '_Components/statistics/btree/documents.jsonl': '',
      '_components/statistics/btree/notes.txt': 'planted-note',
      '_components/statistics/documents.jsonl': '',
      '_components/statistics/_components/documents.jsonl': '',
      '_components/statistics/_storage/kg2abc': 'bytes',
      '_components/../users/documents.jsonl': '',
    };

    const error = refusal(() => anonymiseExport(world.entries(extra)));

    expect(error.problems).toEqual([
      [
        'unexpected entries:',
        '  - _Components/statistics/btree/documents.jsonl',
        '  - _components/../users/documents.jsonl',
        '  - _components/statistics/_components/documents.jsonl',
        '  - _components/statistics/_storage/kg2abc',
        '  - _components/statistics/btree/documents.jsonl.bak',
        '  - _components/statistics/btree/notes.txt',
        '  - _components/statistics/documents.jsonl',
        '  - x_components/statistics/btree/documents.jsonl',
      ].join('\n'),
      'components the snapshot policy does not classify:\n  - Statistics\n  - constructor\n  - newcomer\n  - statisticsX',
    ]);
    expect(error.message).not.toContain('planted-note');
  });
});

describe('scanSnapshot', () => {
  test('finds sign-in rows, extra users and profiles, and denied fields, whatever the policy says', () => {
    const entries = new Map([
      [
        SNAPSHOT_MANIFEST,
        JSON.stringify({ placeholderOwner: { userId: 'placeholder', profileId: 'placeholder-profile' } }),
      ],
      ['authSessions/documents.jsonl', '{"_id":"a","userId":"b"}\n'],
      ['users/documents.jsonl', '{"_id":"placeholder"}\n{"_id":"someone"}\n'],
      ['profiles/documents.jsonl', '{"_id":"placeholder-profile"}\n{"_id":"someone-profile"}\n'],
      ['groups/documents.jsonl', '{"_id":"c","extra":{"phone":"0"}}\n'],
    ]);

    expect(scanSnapshot(entries)).toEqual([
      { table: 'authSessions', field: '*', kind: 'sign-in table' },
      { table: 'users', field: '*', kind: 'user row' },
      { table: 'profiles', field: '*', kind: 'profile row' },
      { table: 'groups', field: 'extra', kind: 'denied field' },
    ]);
  });

  test('passes a rehosted user image URL and still stops a bare token', () => {
    const key = '0123456789abcdef'.repeat(4);
    const url = `https://dune.zone${userImagePublicPath(`${key}.jpg`)}`;
    const rulesets = (...rows: Row[]) =>
      new Map([['rulesets/documents.jsonl', rows.map((row) => `${JSON.stringify(row)}\n`).join('')]]);

    expect(scanSnapshot(rulesets({ _id: 'r', image_cover: url, cover: { url, width: 320, height: 320 } }))).toEqual([]);
    expect(
      scanSnapshot(
        rulesets(
          { _id: 'bare', image_cover: key },
          { _id: 'upper', cover: { url: `https://dune.zone${userImagePublicPath(`${key.toUpperCase()}.jpg`)}` } },
          { _id: 'long', about: `https://dune.zone${userImagePublicPath(`${key}${key}.jpg`)}` }
        )
      )
    ).toEqual([
      { table: 'rulesets', field: 'image_cover', kind: 'token' },
      { table: 'rulesets', field: 'cover', kind: 'token' },
      { table: 'rulesets', field: 'about', kind: 'token' },
    ]);
  });
});

describe('verifySnapshot', () => {
  test('accepts what the anonymiser wrote and refuses a raw export', () => {
    const { world } = authorWorld();
    const { entries } = anonymiseExport(world.entries());

    expect(verifySnapshot(entries)).toEqual(manifestOf(entries));
    const { problems } = refusal(() => verifySnapshot(world.entries()));
    expect(problems).toContain(
      `the file has no ${SNAPSHOT_MANIFEST} from the anonymiser, so it is not an anonymised snapshot`
    );
    expect(problems).toContainEqual(
      expect.stringMatching(/^tables the snapshot policy drops:\n(?: {2}- .+\n)* {2}- authAccounts(?:\n|$)/)
    );
  });

  test('refuses a table the policy drops or does not name, even under the anonymiser manifest', () => {
    const { world } = authorWorld();
    const { entries } = anonymiseExport(world.entries());
    const tampered = withRows(withRows(entries, 'faq_answers', [{ _id: 'planted', answer: 'Yes' }]), 'mystery', [
      { _id: 'planted' },
    ]);

    expect(refusal(() => verifySnapshot(tampered)).problems).toEqual([
      'tables the snapshot policy drops:\n  - faq_answers',
      'tables the snapshot policy does not classify:\n  - mystery',
    ]);
  });

  test('refuses a file whose rows differ from the counts in its manifest', () => {
    const { world } = authorWorld();
    const { entries } = anonymiseExport(world.entries());
    const tampered = new Map(entries).set('groups/documents.jsonl', '');
    tampered.delete('rulesets/documents.jsonl');

    expect(refusal(() => verifySnapshot(tampered)).problems).toEqual([
      'tables whose rows differ from the manifest:\n  - groups: 1 in the manifest, 0 in the file\n  - rulesets: 1 in the manifest, no entry in the file',
    ]);
  });

  test('refuses a file without factions, empty or left out, which the rebuild contract requires', () => {
    const { entries } = anonymiseExport(syntheticExport().entries());
    const { world } = authorWorld();
    const withoutFactions = withRows(anonymiseExport(world.entries()).entries, 'factions', null);

    for (const snapshot of [entries, withoutFactions]) {
      expect(refusal(() => verifySnapshot(snapshot)).problems).toEqual([
        'tables that must hold rows, which the file leaves empty:\n  - factions',
      ]);
    }
  });

  test("refuses users and profiles that are not the placeholder owner's rows alone", () => {
    const { world } = authorWorld();
    const { entries } = anonymiseExport(world.entries());
    const [user] = rowsOf(entries, 'users');
    const [profile] = rowsOf(entries, 'profiles');
    const placeholderRefusal = (tables: string[]) => [
      `tables that must hold the placeholder owner's row alone:\n${tables.map((table) => `  - ${table}`).join('\n')}`,
    ];

    const emptied = withRows(withRows(entries, 'users', []), 'profiles', [{ ...profile, username: 'Someone' }]);
    expect(refusal(() => verifySnapshot(emptied)).problems).toEqual(placeholderRefusal(['users', 'profiles']));
    const named = withRows(entries, 'users', [{ ...user, name: 'Author' }]);
    expect(refusal(() => verifySnapshot(named)).problems).toEqual(placeholderRefusal(['users']));
  });
});

describe('document ids', () => {
  test('decode the way a Convex backend encodes them', () => {
    /* A users id (table 10037) that a local backend issued for a synthetic deployment. */
    expect(tableNumberOfId('pn775r6153df41095dzcbptt418fa7z1')).toBe(10_037);
    expect(tableNumberOfId('pn775r6153df41095dzcbptt418fa7z2')).toBeNull();
  });
});
