import { Anchor, Button, Code, Group, NumberInput, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { CodeExample } from '@ui/content/CodeExample';
import { useReducer, useState } from 'react';

import styles from './dataTeaching.module.css';

const REPOSITORY = 'https://github.com/ndelangen/dunezone/blob/main';

function AudienceSketch({ privateData = false }: { privateData?: boolean }) {
  const rows = [30, 76, 122];
  return (
    <svg
      className={`${styles.audience} ${privateData ? styles.privateData : styles.publicData}`}
      viewBox="0 0 300 152"
      role="img"
      aria-label={
        privateData
          ? 'Each visitor has a separate private query result'
          : 'One public result is shared by three visitors'
      }
    >
      {privateData ? (
        rows.map((y) => (
          <g key={y}>
            <ellipse cx="60" cy={y - 7} rx="25" ry="7" />
            <path d={`M35 ${y - 7}v18q25 14 50 0v-18M88 ${y}H230`} />
          </g>
        ))
      ) : (
        <>
          <ellipse cx="60" cy="54" rx="32" ry="10" />
          <path d="M28 54V93Q60 115 92 93V54M94 76H177M177 30V122" />
          {rows.map((y) => (
            <path key={y} d={`M177 ${y}H230`} />
          ))}
        </>
      )}
      {rows.map((y) => (
        <g key={y}>
          <circle cx="257" cy={y - 6} r="10" />
          <path d={`M241 ${y + 16}q16-22 32 0M225 ${y - 4}l7 4-7 4`} />
        </g>
      ))}
    </svg>
  );
}

function QuerySharing() {
  const [readers, setReaders] = useState(3);
  return (
    <Stack gap="xl">
      <Text>
        Most public pages read two kinds of data. A page query loads public content, such as a faction. A separate
        private query loads the viewer's profile or session.
      </Text>
      <figure className={styles.diagram} aria-label="The browser combines public page data with private viewer data">
        <div className={styles.lanes}>
          <div className={styles.lane}>
            <Text fw={700}>Public page data</Text>
            <Code>factions.pageBySlug</Code>
            <AudienceSketch />
          </div>
          <div className={styles.lane}>
            <Text fw={700}>Private viewer data</Text>
            <Code>profiles.session</Code>
            <AudienceSketch privateData />
          </div>
        </div>
        <div className={styles.join} aria-hidden>
          ↓ &nbsp; compose the page &nbsp; ↓
        </div>
        <figcaption>
          <svg
            className={styles.browser}
            viewBox="0 0 420 130"
            role="img"
            aria-label="A browser combines shared content with this viewer's controls"
          >
            <rect x="5" y="5" width="410" height="120" rx="6" />
            <path d="M5 28H415" />
            <circle cx="18" cy="16" r="3" />
            <circle cx="29" cy="16" r="3" />
            <g className={styles.publicData}>
              <rect x="22" y="43" width="235" height="65" rx="3" />
              <path d="M36 58H235M36 73H207M36 88H229" />
            </g>
            <g className={styles.privateData}>
              <rect x="277" y="43" width="120" height="65" rx="3" />
              <circle cx="296" cy="62" r="7" />
              <path d="M286 83Q296 68 306 83M322 62H381M322 80H365" />
            </g>
          </svg>
          <Text size="sm" ta="center">
            Group access can add a small <Code>groups.viewerMembership</Code> query. Mutations check permission again on
            the server.
          </Text>
        </figcaption>
      </figure>
      <Section title="Why the split improves query caching">
        <Text>
          Convex can reuse a public query result for visitors who request the same arguments. If that query also reads
          the viewer's identity, the result can vary by visitor. We keep profile and session reads separate so public
          content can share a cached result.
        </Text>
        <NumberInput
          label="Signed-in viewers looking at the same faction"
          min={1}
          max={12}
          allowDecimal={false}
          allowNegative={false}
          clampBehavior="strict"
          value={readers}
          onChange={(value) => {
            if (typeof value === 'number') {
              setReaders(Math.max(1, Math.min(12, value)));
            }
          }}
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
          <Section title="Shared page query">
            <Text className={styles.count} role="status">
              1 public page result for {readers} viewers
            </Text>
            <Text size="sm">
              Our <Code>publicQuery</Code> builder prevents access to <Code>ctx.auth</Code>. A separate private query
              returns the viewer's profile or session.
            </Text>
          </Section>
          <Section title="Viewer-dependent page query">
            <Text className={styles.count} role="status">
              Up to {readers} page-result variants
            </Text>
            <Text size="sm">
              Reading identity in the page query can produce a different cached result for each viewer.
            </Text>
          </Section>
        </SimpleGrid>
        <Text size="sm" c="dimmed">
          This models distinct results for one query and one slug. It does not measure network requests, execution time
          or cache hit rate.
        </Text>
      </Section>
      <CodeExample
        label="Public page and private viewer hooks"
        code={
          'const page = useFaction(factionId, { initialData });\nconst viewer = useCurrentProfile();\n\n// Share page content. Read the viewer separately.\n// Access-aware screens also use useFactionAccess(pageData).'
        }
      />
      <CodeExample
        label="Separate page data from viewer data · example diff"
        lines={[
          { kind: 'removed', code: 'return { faction, viewerProfile, canEditForThisViewer };' },
          { kind: 'added', code: 'return { faction, owner, assignedGroup };' },
          { kind: 'added', code: '// Combine page data with the viewer query in the browser.' },
        ]}
      />
      <Text size="sm">
        These are two kinds of data, not a fixed subscription count. A page may need an additional access query.
      </Text>
      <Anchor href={`${REPOSITORY}/docs/state-management.md#rules`}>Read the public and private query rules</Anchor>
      <Anchor href={`${REPOSITORY}/src/app/db/viewerAccess.ts`}>
        See the private session and Group membership reads
      </Anchor>
    </Stack>
  );
}

const LIFECYCLE = [
  {
    title: 'Load the first public result',
    place: 'Route loader',
    body: "The loader reads through src/app/db before the page renders. Public SSR uses an anonymous Convex client, so a visitor's credentials cannot leak into the public HTML.",
    code: 'const initialData = await loadPublicFaction(slug);',
  },
  {
    title: 'Hydrate, then subscribe',
    place: 'Page → data doorway → Convex',
    body: 'The page hook shows the loader result while it starts a live subscription. Convex updates that result when the records it reads change.',
    code: 'const page = useFaction(slug, { initialData });\n// No second fetch in a child component.',
  },
  {
    title: 'Render public facts and private controls',
    place: 'Browser composition',
    body: 'The page passes data to its components. It checks viewer permissions separately and waits for that result before showing editing controls.',
    code: 'const { resolved, viewerAccess } = useFactionAccess(pageData);\nconst canEdit = resolved && viewerAccess.capabilities.edit;',
  },
  {
    title: 'Save through a mutation',
    place: 'Page intent → server validation',
    body: 'The mutation checks the current user and validates the write. Convex refreshes affected live query results, so there is no client cache invalidation to perform.',
    code: 'await updateFaction(changes);\n// Subscribed readers receive the changed result.',
  },
] as const;

type SaveExample = { draft: string; saved: string; saves: number };
function saveExampleReducer(state: SaveExample, event: { type: 'edit'; name: string } | { type: 'save' }): SaveExample {
  return event.type === 'edit'
    ? { ...state, draft: event.name }
    : { ...state, saved: state.draft.trim(), saves: state.saves + 1 };
}

function SaveLoop() {
  const [example, dispatch] = useReducer(saveExampleReducer, {
    draft: 'House Atreides',
    saved: 'House Atreides',
    saves: 0,
  });
  return (
    <figure className={styles.saveLoop} aria-label="A save updates both subscribed browsers">
      <div className={styles.saveDrawing}>
        <div className={styles.readers}>
          {[false, true].map((otherReader) => (
            <svg
              key={String(otherReader)}
              className={styles.reader}
              viewBox="0 0 320 155"
              role="img"
              aria-label={`${otherReader ? 'Another reader' : 'Your page'} shows ${example.saved}`}
            >
              <rect x="8" y="8" width="304" height="139" rx="6" />
              <path d="M8 36H312" />
              <circle cx="22" cy="22" r="3" />
              <circle cx="33" cy="22" r="3" />
              <text x="160" y="64" textAnchor="middle">
                {otherReader ? 'Another reader' : 'Your page'}
              </text>
              <g className={styles.publicData}>
                <rect x="26" y="80" width="268" height="48" rx="3" />
                <text
                  x="160"
                  y="110"
                  textAnchor="middle"
                  textLength={example.saved.length > 20 ? 236 : undefined}
                  lengthAdjust="spacingAndGlyphs"
                >
                  {example.saved}
                </text>
              </g>
            </svg>
          ))}
        </div>
        <svg
          className={styles.saveArrows}
          viewBox="0 0 180 330"
          role="img"
          aria-label="The editor sends a mutation; Convex sends changed query results to both readers"
        >
          <g className={styles.mutation}>
            <text x="90" y="22" textAnchor="middle">
              1. Save
            </text>
            <path d="M4 62H168M158 54L168 62 158 70" />
            <text x="90" y="47" textAnchor="middle">
              mutation
            </text>
          </g>
          <g className={styles.publicData}>
            <path d="M174 188H92V113H4M14 105L4 113 14 121M92 188V281H4M14 273L4 281 14 289" />
            <text x="130" y="217" textAnchor="middle">
              2. Live
            </text>
            <text x="130" y="240" textAnchor="middle">
              results
            </text>
          </g>
        </svg>
        <div className={styles.server}>
          <svg
            className={styles.database}
            viewBox="0 0 240 270"
            role="img"
            aria-label={`Convex stores ${example.saved}`}
          >
            <text x="120" y="26" textAnchor="middle">
              Convex
            </text>
            <g className={styles.mutation}>
              <path d="M104 48L120 43 136 48V64Q135 76 120 83Q105 76 104 64ZM112 62L118 68 128 55" />
              <text x="120" y="108" textAnchor="middle">
                Check permission
              </text>
            </g>
            <g className={styles.publicData}>
              <ellipse cx="120" cy="150" rx="90" ry="22" />
              <path d="M30 150V220Q120 267 210 220V150" />
              <text
                x="120"
                y="202"
                textAnchor="middle"
                textLength={example.saved.length > 14 ? 164 : undefined}
                lengthAdjust="spacingAndGlyphs"
              >
                {example.saved}
              </text>
            </g>
          </svg>
        </div>
      </div>
      <svg
        className={styles.saveMobile}
        viewBox="0 0 360 400"
        role="img"
        aria-label={`Your page and another reader both show ${example.saved}. A save passes a permission check, then Convex updates both readers.`}
      >
        {[0, 184].map((x, index) => (
          <g key={x} transform={`translate(${x} 0)`}>
            <rect x="4" y="4" width="168" height="108" rx="5" />
            <path d="M4 25H172" />
            <text x="88" y="49" textAnchor="middle">
              {index ? 'Another reader' : 'Your page'}
            </text>
            <g className={styles.publicData}>
              <path d="M17 61H159" />
              <text
                x="88"
                y="85"
                textAnchor="middle"
                textLength={example.saved.length > 14 ? 148 : undefined}
                lengthAdjust="spacingAndGlyphs"
              >
                {example.saved}
              </text>
            </g>
          </g>
        ))}
        <g className={styles.mutation}>
          <path d="M49 115V208H142M134 200L142 208 134 216" />
          <text x="85" y="151" textAnchor="middle">
            1. Save
          </text>
        </g>
        <g className={styles.publicData}>
          <path d="M180 296V165H121V116M113 124L121 116 129 124M180 165H268V116M260 124L268 116 276 124" />
          <text x="263" y="193" textAnchor="middle">
            2. Live results
          </text>
        </g>
        <g className={styles.mutation}>
          <path d="M164 194L180 189 196 194V210Q195 222 180 229Q165 222 164 210ZM172 208L178 214 188 201" />
          <text x="180" y="254" textAnchor="middle">
            Check permission
          </text>
        </g>
        <g className={styles.publicData}>
          <ellipse cx="180" cy="292" rx="97" ry="18" />
          <path d="M83 292V350Q180 386 277 350V292" />
          <text
            x="180"
            y="337"
            textAnchor="middle"
            textLength={example.saved.length > 18 ? 176 : undefined}
            lengthAdjust="spacingAndGlyphs"
          >
            {example.saved}
          </text>
        </g>
        <text x="180" y="395" textAnchor="middle">
          Convex
        </text>
      </svg>
      <Group align="end" gap="sm">
        <TextInput
          label="Try a local name change"
          value={example.draft}
          maxLength={24}
          onChange={(event) => dispatch({ type: 'edit', name: event.currentTarget.value })}
        />
        <Button
          color="confirm"
          disabled={!example.draft.trim() || example.draft.trim() === example.saved}
          onClick={() => dispatch({ type: 'save' })}
        >
          Save sample name
        </Button>
      </Group>
      <figcaption>
        <Text size="sm" c="dimmed" role="status">
          {example.saves
            ? `Both readers now show ${example.saved}. Editing the field alone leaves their results unchanged.`
            : 'Edit the name, then save. Both readers receive the same changed record.'}
        </Text>
        <Text size="sm" c="dimmed">
          This local model makes no requests. The real mutation validates the write on the server.
        </Text>
      </figcaption>
    </figure>
  );
}

function DataLifecycle() {
  return (
    <Stack gap="xl">
      <SaveLoop />
      <ol className={styles.journey} aria-label="Read, subscribe, render and save">
        {LIFECYCLE.map((step, index) => (
          <li key={step.title}>
            <Section eyebrow={`${index + 1} · ${step.place}`} title={step.title}>
              <Text>{step.body}</Text>
              <CodeExample label={`${step.place} · TypeScript`} code={step.code} />
            </Section>
          </li>
        ))}
      </ol>
      <Section title="Returning to a page">
        <Text>
          After you leave a page, the live-query module keeps its subscription open for two minutes. It also keeps a
          browser loader's read open for thirty seconds. Convex continues updating these results, so returning to the
          page can reuse them. The module limits how many subscriptions it holds.
        </Text>
        <Text>
          Pickers, searches with changing arguments and admin screens use plain queries. They release unused
          subscriptions instead of retaining each result.
        </Text>
      </Section>
      <Anchor href={`${REPOSITORY}/docs/state-management.md`}>Read the state-management guide</Anchor>
    </Stack>
  );
}

export function DataTeaching({ topic }: { topic: 'queries' | 'lifecycle' }) {
  return topic === 'queries' ? <QuerySharing /> : <DataLifecycle />;
}
