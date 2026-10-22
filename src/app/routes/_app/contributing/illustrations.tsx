import { Anchor, Button, Code, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { slugify } from '@shared/slugify';
import { CodeExample } from '@ui/content/CodeExample';
import { StatusBadge } from '@ui/content/StatusBadge';
import { ConfirmDeleteButton } from '@ui/control/ConfirmDeleteButton';
import { IconAction } from '@ui/control/IconAction';
import { AtlasLayout } from '@ui/layout/AtlasLayout';
import { Check, RotateCcw, Save, X } from 'lucide-react';
import { useState } from 'react';

import styles from './illustrations.module.css';

const REPOSITORY = 'https://github.com/ndelangen/dunezone/blob/main';

function QueuePublication() {
  return (
    <div className={styles.publishStep} data-kind="record">
      <Text fw={700}>1. Queue the asset</Text>
      <div className={styles.publishDrawing}>
        <svg
          className={styles.queueDrawing}
          viewBox="0 0 280 210"
          role="img"
          aria-label="An asset update creates a queued publication job"
        >
          <text x="62" y="28" textAnchor="middle">
            Asset record
          </text>
          <rect x="22" y="43" width="80" height="100" rx="4" />
          <path d="M34 64H90M34 82H77M34 100H88M34 118H67M109 95H151M143 87L151 95 143 103" />
          <text x="214" y="28" textAnchor="middle">
            Job queue
          </text>
          {[49, 86, 123].map((y) => (
            <g key={y}>
              <rect x="165" y={y} width="97" height="27" rx="3" />
              <circle cx="179" cy={y + 13} r="4" />
              <path d={`M191 ${y + 13}H250`} />
            </g>
          ))}
          <path d="M30 173H250M242 165L250 173 242 181" />
          <text x="140" y="204" textAnchor="middle">
            Saved now, image later
          </text>
        </svg>
        <Anchor href="https://docs.convex.dev/" size="sm">
          Convex database and job records
        </Anchor>
      </div>
      <Text size="sm" c="dimmed">
        Convex stores the asset and publication job. Saving requests a new capture. A renderer revision increase
        requests captures for that asset type.
      </Text>
    </div>
  );
}

function CapturePublication() {
  return (
    <div className={styles.publishStep} data-kind="capture">
      <Text fw={700}>2. Capture in a browser</Text>
      <div className={styles.publishDrawing}>
        <svg
          className={styles.artifact}
          viewBox="0 0 280 210"
          role="img"
          aria-label="A capture page renders one game card without application chrome"
        >
          <rect x="8" y="8" width="264" height="170" rx="5" />
          <path d="M8 32H272" />
          <circle cx="21" cy="20" r="2" />
          <circle cx="31" cy="20" r="2" />
          <text x="145" y="25" textAnchor="middle">
            Capture page
          </text>
          <rect x="104" y="50" width="72" height="111" rx="4" />
          <circle cx="140" cy="94" r="26" />
          <path d="M117 111L136 79 155 107M116 138H165M126 150H156" />
          <g className={styles.captureCorners}>
            <path d="M94 66V40H119M162 40H187V66M187 146V171H162M119 171H94V146" />
          </g>
          <text x="140" y="204" textAnchor="middle">
            Renderer → screenshot
          </text>
        </svg>
        <Anchor href="https://developers.cloudflare.com/browser-run/" size="sm">
          Cloudflare Browser Run
        </Anchor>
      </div>
      <Text size="sm" c="dimmed">
        A <Anchor href="https://developers.cloudflare.com/workers/">Cloudflare Worker</Anchor> leases up to 20 jobs
        every five minutes when enabled. Browser Run opens each capture page and screenshots its game renderer.
      </Text>
    </div>
  );
}

function ServePublication() {
  return (
    <div className={styles.publishStep} data-kind="image">
      <Text fw={700}>3. Serve the publication</Text>
      <div className={styles.publishDrawing}>
        <svg
          className={styles.storageDrawing}
          viewBox="0 0 280 210"
          role="img"
          aria-label="R2 stores a captured image file, then a public page displays that image through PublishedImage"
        >
          <path d="M22 40L32 129Q65 146 98 129L108 40M22 40Q65 22 108 40Q65 58 22 40" />
          <rect x="47" y="62" width="36" height="50" rx="2" />
          <path d="M52 101L63 82 77 99" />
          <text x="65" y="165" textAnchor="middle">
            R2
          </text>
          <path d="M109 92H154M146 84L154 92 146 100" />
          <rect x="165" y="40" width="107" height="109" rx="4" />
          <path d="M165 60H272M178 74H203M178 84H195M178 94H203M178 117H258M178 130H243" />
          <rect x="216" y="73" width="40" height="34" rx="2" />
          <path d="M222 100L235 82 250 100" />
          <text x="219" y="165" textAnchor="middle">
            Public page
          </text>
          <text x="140" y="204" textAnchor="middle">
            PublishedImage
          </text>
        </svg>
        <Anchor href="https://developers.cloudflare.com/r2/" size="sm">
          Cloudflare R2 object storage
        </Anchor>
      </div>
      <Text size="sm" c="dimmed">
        R2 stores the image file. The publication identity selects that file, and PublishedImage displays it while
        reserving its space.
      </Text>
    </div>
  );
}

export function PublishingDiagram() {
  return (
    <figure className={styles.figure} aria-label="How records, publication jobs and public images connect">
      <div className={styles.publishing}>
        <QueuePublication />
        <CapturePublication />
        <ServePublication />
      </div>
      <figcaption>
        <Text size="sm" c="dimmed">
          The saved record can be newer than its public image while a job waits or a capture runs.
        </Text>
      </figcaption>
    </figure>
  );
}

export function SlugExample() {
  const [name, setName] = useState('House Atreides');
  const slug = slugify(name);
  return (
    <Stack gap="sm">
      <TextInput label="Try a faction name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
      <output className={styles.address} aria-label="Example faction URL">
        <span>https://dune.zone/factions/</span>
        <strong>{slug || '…'}</strong>
      </output>
      <Text size="sm" c="dimmed">
        The highlighted part is the slug. If <Code>house-atreides</Code> is taken, a new faction can receive{' '}
        <Code>house-atreides-1</Code>.
      </Text>
    </Stack>
  );
}

export function NamedSlotsExample() {
  return (
    <Stack gap="md">
      <figure className={styles.figure} aria-label="AtlasLayout named slots">
        <AtlasLayout>
          <AtlasLayout.Sidebar>
            <div className={styles.slot} data-slot="sidebar">
              <Code>Sidebar</Code>
              <Text size="sm">Supporting content</Text>
            </div>
          </AtlasLayout.Sidebar>
          <AtlasLayout.Content>
            <div className={styles.slot} data-slot="content">
              <Code>Content</Code>
              <Text size="sm">Main content</Text>
            </div>
          </AtlasLayout.Content>
        </AtlasLayout>
        <figcaption>
          <Text size="sm" c="dimmed">
            This is AtlasLayout itself, with labelled placeholders like its Storybook examples. Its slots stack when the
            container is narrow.
          </Text>
        </figcaption>
      </figure>
      <CodeExample
        label="Named slots · TSX"
        code={
          '<AtlasLayout>\n  <AtlasLayout.Sidebar>\n    <SupportingContent />\n  </AtlasLayout.Sidebar>\n  <AtlasLayout.Content>\n    <MainContent />\n  </AtlasLayout.Content>\n</AtlasLayout>'
        }
      />
    </Stack>
  );
}

function FloatingSketch({ nested }: Readonly<{ nested: boolean }>) {
  return (
    <svg
      className={styles.floatingSketch}
      data-nested={nested || undefined}
      viewBox="0 0 320 240"
      role="img"
      aria-label={
        nested
          ? 'Avoid: a menu opens an editor which opens another floating picker'
          : 'Use: a small menu and an editor expanded within the page'
      }
    >
      <rect className={styles.pageOutline} x="6" y="6" width="308" height="228" rx="5" />
      <text x="22" y="33">
        Page
      </text>
      <path d="M22 48H285M22 59H230" />
      <rect className={styles.menu} x="178" y="20" width="115" height="72" rx="5" />
      <text x="190" y="45">
        Actions
      </text>
      <path d="M190 57H275M190 72H253" />
      {nested ? (
        <>
          <rect className={styles.editor} x="122" y="81" width="168" height="109" rx="5" />
          <text x="135" y="106">
            Floating editor
          </text>
          <path d="M135 122H271M135 137H245" />
          <rect className={styles.picker} x="199" y="148" width="115" height="72" rx="5" />
          <text x="208" y="176">
            Picker
          </text>
          <path d="M208 190H298M208 204H280" />
        </>
      ) : (
        <>
          <rect className={styles.editor} x="22" y="116" width="276" height="98" rx="5" />
          <text x="35" y="143">
            Inline editor
          </text>
          <path d="M35 161H280M35 180H246M35 199H266" />
        </>
      )}
    </svg>
  );
}

export function FloatingExamples() {
  return (
    <SimpleGrid type="container" cols={{ base: 1, '30rem': 2 }} spacing="lg">
      <figure className={styles.figure}>
        <Group gap="xs">
          <Check size={18} className={styles.positive} aria-hidden />
          <Text fw={700}>Use one floating layer</Text>
        </Group>
        <FloatingSketch nested={false} />
        <figcaption>
          <Text size="sm" c="dimmed">
            The menu contains a few actions. Editing expands in the page, where it has room.
          </Text>
        </figcaption>
      </figure>
      <figure className={styles.figure}>
        <Group gap="xs">
          <X size={18} className={styles.negative} aria-hidden />
          <Text fw={700}>Avoid nested editors</Text>
        </Group>
        <FloatingSketch nested />
        <figcaption>
          <Text size="sm" c="dimmed">
            A menu opens an editor, then another picker. Each layer adds positioning and focus problems.
          </Text>
        </figcaption>
      </figure>
    </SimpleGrid>
  );
}

export function DeleteExample() {
  const [deleted, setDeleted] = useState(false);
  return (
    <Stack gap="sm">
      <Group>
        {deleted ? (
          <>
            <StatusBadge tone="positive">Sample deleted</StatusBadge>
            <Button variant="light" color="selected" onClick={() => setDeleted(false)}>
              Restore sample
            </Button>
          </>
        ) : (
          <ConfirmDeleteButton label="Delete sample" pending={false} onConfirm={() => setDeleted(true)} />
        )}
      </Group>
      <Text role="status" size="sm" c="dimmed">
        {deleted
          ? 'Only this local example changed.'
          : 'Hold for five seconds to remove the sample. Release early to cancel. Space and Enter work too.'}
      </Text>
      <CodeExample
        label="The caller handles the confirmed action · TSX"
        code={
          '<ConfirmDeleteButton\n  label="Delete sample"\n  pending={false}\n  onConfirm={() => setDeleted(true)}\n/>'
        }
      />
    </Stack>
  );
}

export function ToolbarExample() {
  const [saved, setSaved] = useState(false);
  return (
    <figure className={styles.figure}>
      <Group
        role="toolbar"
        aria-label="Example faction toolbar"
        justify="space-between"
        wrap="nowrap"
        className={styles.toolbar}
      >
        <Text size="sm" c="dimmed">
          Faction draft
        </Text>
        <Group gap="xs" wrap="nowrap">
          <IconAction
            label="Reset sample"
            icon={<RotateCcw size={18} />}
            intent="neutral"
            emphasis="standard"
            onClick={() => setSaved(false)}
          />
          <Button color="confirm" leftSection={<Save size={16} aria-hidden />} onClick={() => setSaved(true)}>
            Save sample
          </Button>
        </Group>
      </Group>
      <Text size="sm" role="status" c="dimmed">
        {saved
          ? 'Sample saved in this example.'
          : 'Save is the primary action. Hover or focus the reset icon to read its name.'}
      </Text>
      <CodeExample
        label="One primary action, with a named secondary action · TSX"
        code={
          '<IconAction\n  label="Reset sample"\n  intent="neutral"\n  emphasis="standard"\n  icon={<RotateCcw />}\n  onClick={reset}\n/>\n<Button color="confirm" onClick={save}>\n  Save sample\n</Button>'
        }
      />
    </figure>
  );
}

export function ContractExample() {
  return (
    <Stack gap="md">
      <CodeExample
        label="Use the data type exported by the doorway · TypeScript"
        lines={[
          { kind: 'removed', code: 'type FactionPage = { faction: MyFactionCopy };' },
          { kind: 'added', code: "import type { FactionDetailPageData } from '@db/factions';" },
          { kind: 'added', code: "type PageFaction = FactionDetailPageData['faction'];" },
        ]}
      />
      <CodeExample
        label="Test the refusal a caller receives · Convex seam test excerpt"
        code={
          'const member = t.withIdentity({ subject: ids.activeId });\n\nawait expect(\n  member.mutation(api.factions.update, {\n    id: ids.factionId,\n    data: { ...stored, name: "Member Renamed Faction" },\n  })\n).rejects.toThrow("Not authorized");'
        }
      />
      <Text size="sm" c="dimmed">
        A collaborator may edit this faction, but cannot rename it. The test checks the mutation result without
        inspecting how the permission check is written.
      </Text>
      <Anchor size="sm" href={`${REPOSITORY}/convex/collaborativeAccess.test.ts`}>
        Read the access tests
      </Anchor>
    </Stack>
  );
}

export function CommentExamples() {
  return (
    <Stack gap="md">
      <CodeExample
        label="Avoid · the comment repeats the value"
        code={'/* Keep the query for two minutes. */\nconst holdMs = 120_000;'}
      />
      <CodeExample
        label="Use · explain why the query stays open"
        code={'/* Keep the subscription open so back navigation can reuse live data. */\nconst holdMs = 120_000;'}
      />
    </Stack>
  );
}
