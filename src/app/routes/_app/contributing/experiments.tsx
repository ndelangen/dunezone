import { Group, SimpleGrid, Slider, Stack, Switch, Text } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { CodeExample } from '@ui/content/CodeExample';
import type { CodeExampleLine } from '@ui/content/CodeExample';
import { StatusBadge } from '@ui/content/StatusBadge';
import type { StatusBadgeTone } from '@ui/content/StatusBadge';
import { useState } from 'react';

import styles from './experiments.module.css';
import { TestingLayerSketch } from './testingLayers';

export type GuideExperimentKind = 'membrane' | 'page' | 'publishing' | 'migration' | 'layout' | 'meaning' | 'tests';
const source = (...lines: string[]) => lines.join('\n');
const diff = (removed: string, added: string): CodeExampleLine[] => [
  ...removed.split('\n').map((code) => ({ kind: 'removed' as const, code })),
  ...added.split('\n').map((code) => ({ kind: 'added' as const, code })),
];
type FlowStep = { title: string; place: string; explanation: string; code: string; language?: 'typescript' | 'yaml' };
const FLOWS: Record<'publishing' | 'tests', { steps: FlowStep[] }> = {
  publishing: {
    steps: [
      {
        title: 'Save',
        place: 'Convex record',
        explanation:
          'Saving an asset records its new content and queues publication work. The browser can show a live renderer before the public image is ready.',
        code: source('await updateAsset(draft);', '// A publication job requests a new image.'),
      },
      {
        title: 'Pickup',
        place: 'Scheduled publisher',
        explanation:
          'When pickup is enabled, the publisher runs every five minutes and leases up to twenty pending jobs.',
        code: source(
          'const schedule = "*/5 * * * *";',
          'const maxItems = 20;',
          '// A lease stops two publisher runs from taking the same job.'
        ),
      },
      {
        title: 'Capture',
        place: 'Browser renderer',
        explanation:
          'A browser opens the bare capture page. The same game renderer draws the card or token without application chrome.',
        code: source('<SpiceBoardMap', '  board={board}', '  tints={asset.tints}', '/>'),
      },
      {
        title: 'Serve',
        place: 'R2 → PublishedImage',
        explanation:
          'The publisher stores the result. Public pages use PublishedImage with the current publication identity, so the requested image matches the saved publication.',
        code: source('<PublishedImage', '  src={publishedUrl}', '  name={asset.name}', '  aspect={1}', '/>'),
      },
    ],
  },
  tests: {
    steps: [
      {
        title: 'Wrong prop',
        place: 'Typecheck',
        explanation: 'PageTitle takes a string. Typecheck rejects a number before the page runs.',
        code: source(
          'type Props = { title: string };',
          '<PageTitle title={42} />',
          '// Type error: number is not assignable to string.'
        ),
      },
      {
        title: 'Wrong access',
        place: 'Seam test',
        explanation:
          'A Convex seam test calls the same function the app uses. Running it as another user checks that ownership rules reject the edit.',
        code: source('await expect(', '  otherUser.mutation(api.factions.update, changes)', ').rejects.toThrow();'),
      },
      {
        title: 'Wrong interaction',
        place: 'Story play test',
        explanation:
          'A browser story can type into a control, activate a tab and check what the reader sees afterwards.',
        code: source(
          'await userEvent.click(',
          '  page.getByRole("tab", { name: "Image publishing" })',
          ');',
          'await expect(page.getByRole("tab", {',
          '  name: "Image publishing",',
          '})).toHaveAttribute("aria-selected", "true");'
        ),
      },
      {
        title: 'Broken user journey',
        place: 'End-to-end test',
        explanation:
          'A few end-to-end tests run complete journeys through the real local stack. Saving must still work after sign-in and a reload.',
        code: source(
          'await signIn(page);',
          'await editFaction(page, "Atreides");',
          'await page.reload();',
          'await expect(page.getByText("Atreides")).toBeVisible();'
        ),
      },
      {
        title: 'Wrong release',
        place: 'Runtime verification',
        explanation:
          'A release can contain the wrong files or commit even when tests pass. Runtime verification checks the assembled HTML, assets and release identity.',
        code: source(
          'expect(health.identity.gitSha).toBe(mergedCommit);',
          'expect(await page.title()).toContain("Dune Zone");',
          '// Open the deployed route and test its interactions.'
        ),
      },
    ],
  },
};

function FlowLab({ kind }: { kind: keyof typeof FLOWS }) {
  const model = FLOWS[kind];
  return (
    <ol className={styles.journey}>
      {model.steps.map((step, index) => (
        <li key={step.title}>
          <Section eyebrow={`${index + 1} · ${step.place}`} title={step.title}>
            {kind === 'tests' ? <TestingLayerSketch layer={index} /> : null}
            <Text>{step.explanation}</Text>
            <CodeExample
              label={`${step.title} · example code`}
              language={step.language ?? 'typescript'}
              code={step.code}
            />
          </Section>
        </li>
      ))}
    </ol>
  );
}

function MembraneSketch({ bypass = false }: { bypass?: boolean }) {
  return (
    <figure className={styles.contractFigure}>
      <Text fw={700} c={bypass ? 'var(--color-error)' : 'var(--action-positive-fg)'}>
        {bypass ? 'Avoid hidden effects' : 'Pass values, report intent'}
      </Text>
      <svg
        className={styles.membrane}
        data-bypass={bypass || undefined}
        viewBox="0 0 360 330"
        role="img"
        aria-label={
          bypass
            ? 'Avoid: a component fetches from the database and navigates without involving its caller'
            : 'Use: the page reads data and passes a name in; the component reports a change and the page saves it'
        }
      >
        <rect className={styles.callerOutline} x="8" y="8" width="344" height="314" rx="6" />
        <path d="M8 40H352" />
        <circle cx="23" cy="24" r="3" />
        <circle cx="34" cy="24" r="3" />
        <text x="180" y="31" textAnchor="middle">
          Page, the caller
        </text>
        <g>
          <ellipse cx="68" cy="89" rx="29" ry="9" />
          <path d="M39 89V119Q68 139 97 119V89" />
          <text x="68" y="66" textAnchor="middle">
            Database
          </text>
        </g>
        <rect className={styles.boundary} x="204" y="78" width="132" height="208" rx="8" />
        <text x="270" y="108" textAnchor="middle">
          Component
        </text>
        <text className={styles.membraneLabel} x="270" y="310" textAnchor="middle">
          Membrane
        </text>
        <rect x="218" y="147" width="104" height="38" rx="3" />
        <text x="270" y="172" textAnchor="middle">
          Atreides
        </text>
        <path d="M258 208V235L266 229 274 243 282 239 274 224 285 222Z" />
        {bypass ? (
          <g className={styles.bypass}>
            <path d="M100 97H270V143M262 135L270 143 278 135" />
            <text x="165" y="83" textAnchor="middle">
              fetch
            </text>
            <path d="M250 243H68V280M60 272L68 280 76 272" />
            <path d="M113 107L125 119M125 107L113 119M150 232L162 244M162 232L150 244" />
            <text x="138" y="272" textAnchor="middle">
              navigate
            </text>
            <rect x="39" y="286" width="58" height="23" rx="2" />
            <path d="M39 293H97" />
          </g>
        ) : (
          <>
            <g className={styles.values}>
              <path d="M68 140V166H214M206 158L214 166 206 174" />
              <text x="143" y="153" textAnchor="middle">
                name
              </text>
            </g>
            <g className={styles.intents}>
              <path d="M217 243H68V180M60 188L68 180 76 188" />
              <text x="139" y="269" textAnchor="middle">
                onChange(name)
              </text>
              <text x="135" y="210" textAnchor="middle">
                Save
              </text>
              <text x="135" y="230" textAnchor="middle">
                in caller
              </text>
            </g>
          </>
        )}
      </svg>
      <figcaption>
        <Text size="sm" c="dimmed">
          {bypass
            ? 'Effects inside the component skip the caller. Rendering it can fetch; choosing a value can navigate.'
            : "The caller owns reads, writes and navigation. The component receives values and reports the user's choice."}
        </Text>
      </figcaption>
    </figure>
  );
}

function MembraneLab() {
  return (
    <Stack gap="xl">
      <div className={styles.membraneExamples}>
        <MembraneSketch />
        <MembraneSketch bypass />
      </div>
      <Section title="Pass data in">
        <Text>
          The component renders a name it receives. The page reads the name and chooses which value to provide.
        </Text>
        <CodeExample
          label="Move the read to the caller · example TSX diff"
          lines={diff(
            'function Name() {\n  const name = useQuery(api.names.current);\n  return <Text>{name}</Text>;\n}',
            'function Name({ name }: { name: string }) {\n  return <Text>{name}</Text>;\n}'
          )}
        />
      </Section>
      <Section title="Report a user action">
        <Text>
          The component reports a choice or a request to save. Its caller decides which mutation or navigation follows.
        </Text>
        <CodeExample
          label="Move the effect to the caller · example TSX diff"
          lines={diff(
            '<Button onClick={() => saveName(name)}>Save name</Button>',
            '<Button onClick={onSave}>Save name</Button>'
          )}
        />
      </Section>
      <Text>
        A kit component cannot fetch data or navigate on its own. A Picker may fetch its options when opened. It is a
        domain control outside the kit and cannot mutate data.
      </Text>
    </Stack>
  );
}

function AnatomyLab() {
  return (
    <Stack gap="xl">
      <Text>
        The header carries the title and introduction. The optional toolbar carries page-wide controls. Content is the
        main landmark. AppFooter belongs to the shell, so PageLayout has no footer slot.
      </Text>
      <CodeExample
        label="An application page · TSX"
        code={source(
          '<PageLayout>',
          '  <PageLayout.Header>',
          '    <PageTitle title="Example" />',
          '  </PageLayout.Header>',
          '  <PageLayout.Toolbar>',
          '    <Toolbar>',
          '      <Toolbar.Center>Page-wide controls</Toolbar.Center>',
          '    </Toolbar>',
          '  </PageLayout.Toolbar>',
          '  <PageLayout.Content>',
          '    <Section title="Details">…</Section>',
          '  </PageLayout.Content>',
          '</PageLayout>'
        )}
      />
      <CodeExample
        label="Use the named slot · example diff"
        lines={diff(
          '<header><h1>Example</h1></header>',
          '<PageLayout.Header>\n  <PageTitle title="Example" />\n</PageLayout.Header>'
        )}
      />
    </Stack>
  );
}

const WIDE_NAME_SCHEMA =
  'const Name = z.union([\n  z.object({ name: z.string() }),\n  z.object({ displayName: z.string() }),\n]);';
const MIGRATION_SCHEMAS = [
  {
    title: 'Old shape',
    schema: 'const Name = z.object({ name: z.string() });',
    explanation: 'The starting schema and every stored record use name.',
    acceptsOld: true,
    acceptsNew: false,
    oldRows: 4,
    change: 'Before the rollout',
  },
  {
    title: 'Widen',
    schema: WIDE_NAME_SCHEMA,
    explanation: 'Deploy a schema that accepts both fields. The stored records have not changed yet.',
    acceptsOld: true,
    acceptsNew: true,
    oldRows: 4,
    change: 'Schema changes; records stay old',
  },
  {
    title: 'Migrate',
    schema: WIDE_NAME_SCHEMA,
    explanation: 'New writes use displayName. Backfill existing records while reads still tolerate both shapes.',
    acceptsOld: true,
    acceptsNew: true,
    oldRows: 2,
    change: 'Backfill changes the stored records',
  },
  {
    title: 'Verify',
    schema: WIDE_NAME_SCHEMA,
    explanation:
      'Prove that no legacy records remain. Also wait until clients no longer need the old field before narrowing.',
    acceptsOld: true,
    acceptsNew: true,
    oldRows: 0,
    change: 'Zero old rows + no old client writes',
  },
  {
    title: 'Narrow',
    schema: 'const Name = z.object({ displayName: z.string() });',
    explanation: 'In a later release, remove the old field from the schema. Old requests now fail validation.',
    acceptsOld: false,
    acceptsNew: true,
    oldRows: 0,
    change: 'Later release: remove the old shape',
  },
] as const;

function SchemaSnapshot({ stage, oldClient }: { stage: (typeof MIGRATION_SCHEMAS)[number]; oldClient: boolean }) {
  const accepts = oldClient ? stage.acceptsOld : stage.acceptsNew;
  const requestY = oldClient ? 58 : 94;
  return (
    <svg
      className={styles.schemaSnapshot}
      viewBox="0 0 360 318"
      role="img"
      aria-label={`${stage.title}: accepts ${stage.acceptsOld ? 'name' : ''}${stage.acceptsOld && stage.acceptsNew ? ' and ' : ''}${stage.acceptsNew ? 'displayName' : ''}. ${stage.oldRows} old records, ${4 - stage.oldRows} new records. Sample request ${accepts ? 'accepted' : 'rejected'}.`}
    >
      <g className={oldClient ? styles.legacyShape : styles.newShape}>
        <rect x="8" y="12" width="139" height="88" rx="4" />
        <path d="M8 35H147" />
        <circle cx="20" cy="23" r="2" />
        <text x="77" y="28" textAnchor="middle">
          Sample client
        </text>
        <text x="77" y="71" textAnchor="middle">
          {oldClient ? 'name' : 'displayName'}
        </text>
      </g>
      <g className={accepts ? styles.acceptedShape : styles.rejectedShape}>
        <path d={`M153 65H176V${requestY}H205M197 ${requestY - 8}L205 ${requestY} 197 ${requestY + 8}`} />
        {!accepts ? <path d="M163 106L179 122M179 106L163 122" /> : <path d="M163 112L169 118 181 102" />}
      </g>
      <rect x="214" y="8" width="138" height="119" rx="5" />
      <text x="283" y="29" textAnchor="middle">
        Schema accepts
      </text>
      {[
        { field: 'name', allowed: stage.acceptsOld },
        { field: 'displayName', allowed: stage.acceptsNew },
      ].map(({ field, allowed }, index) => (
        <g key={field} className={allowed ? styles.acceptedShape : styles.rejectedShape}>
          <rect x="222" y={42 + index * 36} width="122" height="29" rx="3" />
          <text x="273" y={62 + index * 36} textAnchor="middle">
            {field}
          </text>
          <path d={allowed ? `M321 ${54 + index * 36}l5 5 10-12` : `M322 ${50 + index * 36}l12 12m0-12-12 12`} />
        </g>
      ))}
      <text x="180" y="158" textAnchor="middle">
        Stored records
      </text>
      {[0, 1, 2, 3].map((row) => {
        const legacy = row < stage.oldRows;
        return (
          <g key={row} className={legacy ? styles.legacyShape : styles.newShape} transform={`translate(${row * 89} 0)`}>
            <path d="M8 176H66L82 192V249H8ZM66 176V192H82" />
            <text className={styles.fieldLabel} x="45" y="214" textAnchor="middle">
              {legacy ? 'name' : 'displayName'}
            </text>
            <path d="M18 229H70M18 239H53" />
          </g>
        );
      })}
      <text className={styles.legacyShape} x="89" y="276" textAnchor="middle">
        {stage.oldRows} old
      </text>
      <text className={styles.newShape} x="270" y="276" textAnchor="middle">
        {4 - stage.oldRows} new
      </text>
      <text x="180" y="307" textAnchor="middle">
        {stage.change}
      </text>
    </svg>
  );
}

function MigrationLab() {
  const [oldClient, setOldClient] = useState(true);
  return (
    <Section title="Rename name to displayName">
      <Switch
        label="Send the old client shape"
        checked={oldClient}
        onChange={(event) => setOldClient(event.currentTarget.checked)}
      />
      <Text size="sm" c="dimmed">
        Try the same request against every stage. The four example records show the rollout separately.
      </Text>
      <CodeExample
        label="Submitted data · JSON"
        language="json"
        code={JSON.stringify(oldClient ? { name: 'Atreides' } : { displayName: 'Atreides' }, null, 2)}
      />
      <ol className={styles.schemaStages} aria-label="Widen, migrate, verify, then narrow in a later release">
        {MIGRATION_SCHEMAS.map((stage) => {
          const accepts = oldClient ? stage.acceptsOld : stage.acceptsNew;
          return (
            <li key={stage.title}>
              <Section
                title={stage.title}
                action={
                  <StatusBadge tone={accepts ? 'positive' : 'negative'}>
                    {accepts ? 'Accepted' : 'Rejected'}
                  </StatusBadge>
                }
              >
                <div className={styles.schemaStageBody}>
                  <SchemaSnapshot stage={stage} oldClient={oldClient} />
                  <Stack gap="md" miw={0}>
                    <Text size="sm">{stage.explanation}</Text>
                    <CodeExample label={`${stage.title} · example Zod schema`} code={stage.schema} />
                  </Stack>
                </div>
              </Section>
            </li>
          );
        })}
      </ol>
      <Text>
        A completed backfill does not stop an older client sending the old field. Narrow only after both the stored
        records and the clients no longer need it.
      </Text>
    </Section>
  );
}

function LayoutLab() {
  const [width, setWidth] = useState(600);
  return (
    <Section
      title="Resize the container"
      description="Move the slider to change the available width. The layout switches to three columns at a container width of 30rem."
    >
      <Text size="sm">Requested container width: {width}px, limited by the available space.</Text>
      <Slider thumbLabel="Container width" min={240} max={800} step={20} value={width} onChange={setWidth} />
      <div className={styles.resizeHost} style={{ width }}>
        <div className={styles.resizeGrid} aria-label="Responsive layout demonstration">
          {['Title', 'Details', 'Actions'].map((label) => (
            <div className={styles.resizeItem} key={label}>
              {label}
            </div>
          ))}
        </div>
      </div>
      <CodeExample
        label="Use a container query · CSS diff"
        language="css"
        lines={diff(
          '@media (width >= 30rem) {\n  .items { grid-template-columns: repeat(3, 1fr); }\n}',
          '@container lesson-room (width >= 30rem) {\n  .items { grid-template-columns: repeat(3, 1fr); }\n}'
        )}
      />
      <Text>
        The browser can be wide while a sidebar is narrow. A container query lets the same layout work in both places.
      </Text>
    </Section>
  );
}

const MEANINGS: { value: StatusBadgeTone; label: string; words: string }[] = [
  { value: 'pending', label: 'Waiting', words: 'Queued' },
  { value: 'progress', label: 'Working', words: 'Capturing' },
  { value: 'positive', label: 'Success', words: 'Published' },
  { value: 'negative', label: 'Failure', words: 'Publication failed' },
];
function MeaningLab() {
  return (
    <Section title="Let status choose the appearance">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {MEANINGS.map((meaning) => (
          <Stack key={meaning.value} gap="xs">
            <Text size="sm">{meaning.label}</Text>
            <Group>
              <StatusBadge tone={meaning.value}>{meaning.words}</StatusBadge>
            </Group>
          </Stack>
        ))}
      </SimpleGrid>
      <CodeExample
        label="Pass a status · TSX diff"
        lines={diff('<Badge color="yellow">Queued</Badge>', '<StatusBadge tone="pending">Queued</StatusBadge>')}
      />
      <Text>A palette change belongs in the kit. Pages keep naming pending, progress, positive or negative.</Text>
    </Section>
  );
}

/** Controls change example values. Each example keeps its explanation visible. */
export function GuideExperiment({ kind }: Readonly<{ kind: GuideExperimentKind }>) {
  return (
    <div className={styles.root}>
      {kind === 'page' ? (
        <AnatomyLab />
      ) : kind === 'membrane' ? (
        <MembraneLab />
      ) : kind === 'migration' ? (
        <MigrationLab />
      ) : kind === 'layout' ? (
        <LayoutLab />
      ) : kind === 'meaning' ? (
        <MeaningLab />
      ) : (
        <FlowLab kind={kind} />
      )}
    </div>
  );
}
