import { Anchor, Code, Stack, Text } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { CodeExample } from '@ui/content/CodeExample';

import styles from './releaseTeaching.module.css';

const STAGES = [
  {
    title: 'Check the commit',
    command: 'scripts/deploy-decision.ts',
    reason:
      'Compare the requested commit with both live Worker identities. Skip the release if it is already deployed or a newer commit has replaced it.',
    consequence: 'This gate decides whether to deploy the commit. Pull request checks run separately.',
  },
  {
    title: 'Deploy compatible Convex functions',
    command: 'bun run migrations:narrow-check → bun run convex:deploy',
    reason:
      'Verify that any schema narrowing is allowed, then deploy functions and schema before publishing the application.',
    consequence:
      'The site still serves the previous browser bundle. Every public query that bundle calls must remain available.',
  },
  {
    title: 'Finish required migrations',
    command: 'bun run migrations:deploy',
    reason: 'Run and verify the migrations the release requires, then initialize missing publication settings.',
    consequence:
      'Existing clients can still write while this happens. Migration code and the schema must continue accepting those writes.',
  },
  {
    title: 'Build and check the release',
    command: 'publisher:assets → publisher:retain-assets → publisher:application-runtime:verify',
    reason:
      "Build browser and server artifacts from the same commit, retain the previous release's hashed browser files, and exercise the assembled public application locally.",
    consequence:
      'Old hashed browser files remain available for at least seven days after replacement. Runtime checks must pass before the site upload.',
  },
  {
    title: 'Deploy the game Worker',
    command: 'game:dry-run → exact game deploy → game-deployment-contract.ts active',
    reason: 'Deploy the private game service and require its active identity before the site Worker connects to it.',
    consequence:
      'An upload alone does not prove the game Worker is serving the new version. The check reads its active release identity.',
  },
  {
    title: 'Publish raster variants',
    command: 'publisher:omit-static-rasters → publish raster variants',
    reason:
      'Install the publish token on the live Worker and upload the generated image variants before the new site starts referencing them.',
    consequence: 'A new browser must not request artwork that has not reached storage yet.',
  },
  {
    title: 'Deploy and check the site Worker',
    command: 'exact site deploy → publisher smoke → game binding smoke',
    reason:
      'Deploy the verified artifact, check its release identity, and test the game through the connection used by dune.zone.',
    consequence:
      'New requests receive the new site bundle. Already-open tabs may still run the previous bundle, so the backend must still support those clients.',
  },
  {
    title: 'Publish Storybook and queue image updates',
    command: 'Storybook deploy → Renderer revision activation → variant verification',
    reason:
      "Publish the isolated Storybook, activate any increased renderer revisions and verify the release's media. A separate job then rebuilds the shared development environment.",
    consequence:
      'Increasing a renderer revision queues new captures. Pages can show the previous published image until its replacement is ready.',
  },
] as const;

function ReleaseNodeDrawing({ kind }: Readonly<{ kind: string }>) {
  if (kind === 'Convex') {
    return (
      <g>
        <ellipse cx="70" cy="49" rx="27" ry="8" />
        <path d="M43 49V78Q70 96 97 78V49M43 64Q70 82 97 64" />
      </g>
    );
  }
  if (kind === 'Open tab') {
    return (
      <g>
        <rect x="31" y="40" width="78" height="51" rx="4" />
        <path d="M31 53H109M41 66H88M41 77H99" />
        <circle cx="40" cy="47" r="2" />
      </g>
    );
  }
  return (
    <g>
      <rect x="39" y="40" width="62" height="22" rx="3" />
      <rect x="39" y="69" width="62" height="22" rx="3" />
      <path d="M52 51H88M52 80H88" />
    </g>
  );
}

function ReleaseNode({
  kind,
  next,
  changed,
}: Readonly<{
  kind: 'Convex' | 'Game Worker' | 'Site Worker' | 'Open tab';
  next: boolean;
  changed: boolean;
}>) {
  return (
    <svg
      className={styles.releaseNode}
      data-version={next ? 'new' : 'previous'}
      data-changing={changed || undefined}
      viewBox="0 0 140 124"
      role="img"
      aria-label={`${kind} runs ${next ? 'new' : 'previous'} code${changed ? ', changes at this step' : ''}`}
    >
      {changed ? <rect className={styles.changeRing} x="3" y="3" width="134" height="118" rx="7" /> : null}
      <text x="70" y="24" textAnchor="middle">
        {kind}
      </text>
      <ReleaseNodeDrawing kind={kind} />
      <text className={styles.versionLabel} x="70" y="112" textAnchor="middle">
        {next ? 'NEW' : 'PREVIOUS'}
      </text>
    </svg>
  );
}

function GateDrawing() {
  return (
    <>
      <rect x="8" y="28" width="70" height="88" rx="3" />
      <path d="M20 48H65M20 62H55M20 77H65" />
      <text x="43" y="143" textAnchor="middle">
        Commit
      </text>
      <path d="M85 72H118M110 64L118 72 110 80M166 24L214 72 166 120 118 72Z" />
      <text x="166" y="78" textAnchor="middle">
        Gate
      </text>
      <g className={styles.nextCode}>
        <path d="M219 72H337M329 64L337 72 329 80" />
        <text x="280" y="58" textAnchor="middle">
          Deploy
        </text>
      </g>
      <path d="M166 125V151H291M283 143L291 151 283 159" />
      <text x="324" y="157" textAnchor="middle">
        Skip
      </text>
    </>
  );
}

function BackendDrawing() {
  return (
    <>
      <rect x="6" y="40" width="105" height="69" rx="4" />
      <path d="M6 56H111M20 73H85M20 89H68" />
      <text x="58" y="136" textAnchor="middle">
        Old browser
      </text>
      <path d="M119 76H174M166 68L174 76 166 84" />
      <g className={styles.nextCode}>
        <rect x="183" y="20" width="168" height="132" rx="5" />
        <text x="267" y="45" textAnchor="middle">
          New backend
        </text>
        <path d="M196 57H338" />
        <text x="267" y="84" textAnchor="middle">
          oldQuery ✓
        </text>
        <text x="267" y="117" textAnchor="middle">
          newQuery ✓
        </text>
      </g>
    </>
  );
}

function BackfillDrawing() {
  return (
    <>
      {[0, 1, 2].map((row) => (
        <g key={row} transform={`translate(0 ${row * 36})`}>
          <rect x="10" y="15" width="106" height="27" rx="3" />
          <path d="M20 29H103" />
        </g>
      ))}
      <path d="M124 65H231M223 57L231 65 223 73" />
      <text x="178" y="45" textAnchor="middle">
        Backfill
      </text>
      <g className={styles.nextCode}>
        {[0, 1, 2].map((row) => (
          <g key={row} transform={`translate(0 ${row * 36})`}>
            <rect x="242" y="15" width="106" height="27" rx="3" />
            <path d="M254 29H313M321 27L327 33 338 21" />
          </g>
        ))}
      </g>
      <text x="62" y="153" textAnchor="middle">
        Legacy rows
      </text>
      <text x="295" y="153" textAnchor="middle">
        Migrated rows
      </text>
    </>
  );
}

function BuildDrawing() {
  return (
    <>
      <rect x="8" y="20" width="71" height="87" rx="3" />
      <path d="M20 42H64M20 58H60M20 74H65M86 64H147M139 56L147 64 139 72" />
      <g className={styles.nextCode}>
        <path d="M158 25H216L236 45V110H158ZM216 25V45H236" />
        <path d="M176 72L188 84 217 55" />
        <text x="195" y="144" textAnchor="middle">
          Built + verified
        </text>
      </g>
      <path d="M276 40H330L348 58V119H276ZM330 40V58H348" />
      <text x="310" y="145" textAnchor="middle">
        Old files
      </text>
      <text x="310" y="167" textAnchor="middle">
        ≥ 7 days
      </text>
      <text x="43" y="143" textAnchor="middle">
        Commit
      </text>
      <text x="142" y="172" textAnchor="middle">
        Not live yet
      </text>
    </>
  );
}

function GameWorkerDrawing() {
  return (
    <>
      <g className={styles.nextCode}>
        <rect x="15" y="20" width="98" height="33" rx="4" />
        <rect x="15" y="64" width="98" height="33" rx="4" />
        <path d="M32 36H95M32 80H95M122 62H190M182 54L190 62 182 70" />
      </g>
      <path d="M238 18L279 30V69Q279 99 238 119Q197 99 197 69V30Z" />
      <path className={styles.nextCode} d="M214 64L231 81 261 46" />
      <text x="64" y="135" textAnchor="middle">
        New game Worker
      </text>
      <text x="244" y="147" textAnchor="middle">
        Active commit = release
      </text>
    </>
  );
}

function MediaDrawing() {
  return (
    <>
      <rect x="8" y="20" width="78" height="76" rx="3" />
      <path d="M18 83L38 49 59 73 72 58M91 38H107V108H31V101" />
      <g className={styles.nextCode}>
        <path d="M119 66H199M191 58L199 66 191 74M215 37L226 111Q272 132 318 111L329 37M215 37Q272 12 329 37Q272 62 215 37" />
        <path d="M252 83L267 98 295 66" />
      </g>
      <text x="59" y="143" textAnchor="middle">
        Raster variants
      </text>
      <text x="272" y="150" textAnchor="middle">
        R2, ready first
      </text>
    </>
  );
}

function BrowserReleaseDrawing() {
  return (
    <>
      {[false, true].map((fresh) => (
        <g
          key={String(fresh)}
          className={fresh ? styles.nextCode : undefined}
          transform={`translate(0 ${fresh ? 0 : 90})`}
        >
          <rect x="7" y="8" width="115" height="56" rx="4" />
          <path d="M7 21H122M20 34H104M20 46H88M129 36H219M211 28L219 36 211 44" />
          <text x="64" y="85" textAnchor="middle">
            {fresh ? 'New visit' : 'Open tab, old code'}
          </text>
        </g>
      ))}
      <g className={styles.nextCode}>
        <rect x="232" y="39" width="119" height="92" rx="5" />
        <text x="292" y="78" textAnchor="middle">
          New
        </text>
        <text x="292" y="102" textAnchor="middle">
          backend
        </text>
      </g>
    </>
  );
}

function FollowUpDrawing() {
  return (
    <>
      <g className={styles.nextCode}>
        <rect x="6" y="20" width="99" height="76" rx="4" />
        <path d="M6 35H105M17 48H38V68H17ZM48 48H69V68H48ZM79 48H94V68H79Z" />
        <text x="55" y="124" textAnchor="middle">
          Storybook
        </text>
      </g>
      <path d="M113 57H162M154 49L162 57 154 65" />
      {[0, 1, 2].map((row) => (
        <rect key={row} x="171" y={23 + row * 25} width="74" height="17" rx="3" />
      ))}
      <text x="208" y="124" textAnchor="middle">
        Queue captures
      </text>
      <text x="208" y="12" textAnchor="middle">
        Revision ↑
      </text>
      <path d="M253 57H277M269 49L277 57 269 65" />
      <rect x="286" y="20" width="67" height="76" rx="3" />
      <path d="M295 82L312 49 344 80" />
      <text x="180" y="164" textAnchor="middle">
        Old image stays until capture succeeds
      </text>
    </>
  );
}

const RELEASE_DRAWINGS = [
  GateDrawing,
  BackendDrawing,
  BackfillDrawing,
  BuildDrawing,
  GameWorkerDrawing,
  MediaDrawing,
  BrowserReleaseDrawing,
  FollowUpDrawing,
];

const RELEASE_DESCRIPTIONS = [
  'The requested commit passes the release gate, or the workflow skips an already deployed or superseded commit',
  'The old browser still calls oldQuery. The new backend retains oldQuery while adding newQuery',
  'Required migrations change stored records from legacy rows to migrated rows and verify completion',
  'Build and verify a new artifact without deploying it; retain previous browser files for at least seven days',
  'Upload the new game Worker, then verify that its active release identity matches the commit',
  'Upload raster image variants to R2 before new browser code requests them',
  'New requests receive new browser code; an already open tab keeps previous code; both use the new backend',
  'Publish the new Storybook and queue new image captures; the previous image remains until a replacement is ready',
];

function ReleaseAction({ step }: Readonly<{ step: number }>) {
  const Drawing = RELEASE_DRAWINGS[step] ?? FollowUpDrawing;
  return (
    <svg className={styles.releaseAction} viewBox="0 0 360 180" role="img" aria-label={RELEASE_DESCRIPTIONS[step]}>
      <Drawing />
    </svg>
  );
}

function ReleaseSketch({ step }: Readonly<{ step: number }>) {
  return (
    <figure className={styles.releaseFigure} aria-label={`Step ${step + 1}: ${STAGES[step].title}`}>
      <ReleaseAction step={step} />
      <div className={styles.states}>
        <ReleaseNode kind="Convex" next={step >= 1} changed={step === 1} />
        <ReleaseNode kind="Game Worker" next={step >= 4} changed={step === 4} />
        <ReleaseNode kind="Site Worker" next={step >= 6} changed={step === 6} />
        <ReleaseNode kind="Open tab" next={false} changed={false} />
      </div>
    </figure>
  );
}

/** The whole release stays visible, including the overlap between old browsers and new server functions. */
export function ReleaseTeaching() {
  return (
    <Stack gap="xl">
      <Text>
        Convex, the game Worker and the site Worker deploy separately. During a release, the previous browser bundle
        runs against the new backend. The deployment order has to support that combination.
      </Text>
      <ol className={styles.timeline} aria-label="Production deployment stages">
        {STAGES.map((stage, index) => (
          <li key={stage.title}>
            <Section title={stage.title}>
              <ReleaseSketch step={index} />
              <Code className={styles.command}>{stage.command}</Code>
              <Text>{stage.reason}</Text>
              <Text size="sm" c="dimmed">
                {stage.consequence}
              </Text>
            </Section>
          </li>
        ))}
      </ol>
      <Section title="Why old browsers still matter">
        <Text>
          After Convex deploys, the site still serves the previous browser bundle. Open tabs can keep running it even
          after the site deploys. If the backend removes a query that bundle calls, the page can crash during render.
        </Text>
        <CodeExample
          label="Replace a query across separate releases · example diff"
          lines={[
            { kind: 'removed', code: '// One release: delete the old query and update the browser.' },
            { kind: 'added', code: '// Release A: keep oldQuery, add newQuery, move the browser.' },
            { kind: 'added', code: '// Later release: remove oldQuery once clients no longer need it.' },
          ]}
        />
      </Section>
      <Section title="If a later stage fails">
        <Text>
          A failed stage stops the workflow, but does not undo the artifacts already deployed. Inspect the live
          identities, correct the failing input and deploy the fix through the workflow. Keep the compatibility and
          asset-retention gates in place.
        </Text>
      </Section>
      <Anchor href="https://github.com/ndelangen/dunezone/blob/main/.github/workflows/deploy-main.yml">
        Read the production workflow
      </Anchor>
      <Anchor href="https://github.com/ndelangen/dunezone/blob/main/docs/deployment.md#browser-files-across-deployments">
        Read how browser files survive a deployment
      </Anchor>
    </Stack>
  );
}
