/**
 * PROTOTYPE — wayfinder ticket #502 "Tech token editor and renderer", round 2.
 * Direction set by Norbert: each token category (shape) gets its OWN editor — this page
 * prototypes the ROUND token editor; shape is fixed by the page, never a tab. The
 * rectangle editor is the odd one out later (multiple decals, like a treachery card).
 * Identity picks the backside mode: single-faced, an EXISTING token as the back, or a
 * custom back. Custom backside adds a Back tab (tabs become Identity | Front | Back).
 * Rail proof is full width, vertically stacked front-over-back when a backside exists.
 * Workbench chrome as settled in #501. In-memory draft, real CustomToken renderer. Throwaway.
 */
import {
  Badge,
  Button,
  Group,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Coins, FlipHorizontal2, RotateCcw, Save, Signature, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { CustomToken } from '@game/assets/token/Custom';
import { backgroundPresets } from '@game/data/backgrounds';

export const Route = createFileRoute('/_app/assets/tokens/create')({
  component: TokenEditorPrototypePage,
});

/* ------------------------------ draft model ------------------------------ */
/* Drives the token-round schema. Shape is NOT a field — it is the Asset type. */

type TokenFace = {
  background: string; // preset key — the real schema stores a Background
  image: string;
  /** three curved labels: one along the top edge, two lines along the bottom */
  top: string;
  bottom1: string;
  bottom2: string;
  /** 1 is the renderer's reference symbol size */
  symbolScale: number;
};

/** every token HAS a backside — the only choice is where it comes from */
type BacksideMode = 'token' | 'custom';

type TokenDraft = {
  name: string;
  front: TokenFace;
  backMode: BacksideMode;
  /** when backMode === 'token': the referenced token — an asset_relations link, not copied data */
  backTokenRef: string | null;
  /** when backMode === 'custom': authored here, part of this token's data */
  backFace: TokenFace | null;
};

const BACKGROUND_OPTIONS = ['techRed', 'techBlue', 'techYellow', 'fremen', 'atreides', 'harkonnen'] as const;

const IMAGE_OPTIONS = ['ambassador', 'heighliners', 'projectile', 'poison', 'karama', 'eye', 'key', 'combat'].map(
  (name) => ({ value: `/vector/icon/${name}.svg`, label: name })
);

/** stand-ins for "some other round token in the catalogue" */
const EXISTING_TOKENS: Record<string, { label: string; face: TokenFace }> = {
  heighliner: { label: 'Heighliner (by gurney)', face: { background: 'techBlue', image: '/vector/icon/heighliners.svg', top: '', bottom1: '', bottom2: '', symbolScale: 1 } },
  fedaykin: { label: 'Fedaykin (by stilgar)', face: { background: 'fremen', image: '/vector/logo/fremen.svg', top: '', bottom1: '', bottom2: '', symbolScale: 1 } },
  karama: { label: 'Karama (by irulan)', face: { background: 'techYellow', image: '/vector/icon/karama.svg', top: '', bottom1: '', bottom2: '', symbolScale: 1 } },
};

const INITIAL_DRAFT: TokenDraft = {
  name: 'Ornithopter',
  front: { background: 'techRed', image: '/vector/icon/ambassador.svg', top: 'ORNITHOPTER', bottom1: 'MOVE', bottom2: '+3 SPACES', symbolScale: 1 },
  backMode: 'custom',
  backTokenRef: null,
  backFace: { background: 'techRed', image: '/vector/icon/ambassador.svg', top: '', bottom1: 'REVERSE', bottom2: '', symbolScale: 1 },
};

const presetOf = (key: string) => backgroundPresets[key as keyof typeof backgroundPresets];

function backFaceOf(draft: TokenDraft): TokenFace | null {
  if (draft.backMode === 'custom') return draft.backFace;
  if (draft.backTokenRef) return EXISTING_TOKENS[draft.backTokenRef]?.face ?? null;
  return null;
}

/* ------------------------------ proof rendering ------------------------------ */

function TokenProof({ face, width, style }: { face: TokenFace; width: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        width,
        height: width,
        position: 'relative',
        borderRadius: '50%',
        overflow: 'hidden',
        boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
        ...style,
      }}
    >
      <div style={{ width, height: width, pointerEvents: 'none' }}>
        <CustomToken
          background={presetOf(face.background)}
          image={face.image}
          circle
          size={{ width: 100 * face.symbolScale, height: 100 * face.symbolScale }}
          top={face.top || undefined}
          bottom={[face.bottom1, face.bottom2].some(Boolean) ? `${face.bottom1}\n${face.bottom2}` : undefined}
        />
      </div>
    </div>
  );
}

/** full-rail-width proof column, measured like the card editor's rail */
function RailProofs({ draft }: { draft: TokenDraft }) {
  const [width, setWidth] = useState(0);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const back = backFaceOf(draft);
  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return (
    <div ref={setNode} style={{ width: '100%' }}>
      {width > 0 && (
        <Stack gap="md">
          <Stack gap={4} align="center">
            <TokenProof face={draft.front} width={width} />
            <Text size="xs" c="dimmed">
              front
            </Text>
          </Stack>
          {back ? (
            <Stack gap={4} align="center">
              <TokenProof face={back} width={width} />
              <Text size="xs" c="dimmed">
                {draft.backMode === 'token' ? 'back — the referenced token' : 'back'}
              </Text>
            </Stack>
          ) : null}
        </Stack>
      )}
    </div>
  );
}

/* ------------------------------ field editors ------------------------------ */

type Patch = (update: Partial<TokenDraft>) => void;

function IdentityFields({ draft, patch }: { draft: TokenDraft; patch: Patch }) {
  return (
    <Stack gap="md">
      <TextInput
        label="Name"
        description="Names the token in the catalogue and determines its URL"
        value={draft.name}
        onChange={(e) => patch({ name: e.currentTarget.value })}
      />
      <div>
        <Text size="sm" fw={500} mb={4}>
          Backside
        </Text>
        <SegmentedControl
          fullWidth
          value={draft.backMode}
          onChange={(value) => {
            const backMode = value as BacksideMode;
            patch({
              backMode,
              backFace:
                backMode === 'custom'
                  ? { background: 'techBlue', image: '/vector/icon/heighliners.svg', top: '', bottom1: '', bottom2: '', symbolScale: 1 }
                  : null,
              backTokenRef: backMode === 'token' ? (Object.keys(EXISTING_TOKENS)[0] ?? null) : null,
            });
          }}
          data={[
            { value: 'custom', label: 'Custom back' },
            { value: 'token', label: 'Existing token' },
          ]}
        />
        <Text size="xs" c="dimmed" mt={6}>
          {draft.backMode === 'token'
            ? 'Another token serves as this one’s back — a reference, not a copy.'
            : 'A back face authored here, as part of this token.'}
        </Text>
      </div>
      {draft.backMode === 'token' ? (
        <Select
          label="Back token"
          description="Reversing reveals this token"
          data={Object.entries(EXISTING_TOKENS).map(([value, t]) => ({ value, label: t.label }))}
          value={draft.backTokenRef}
          onChange={(value) => value && patch({ backTokenRef: value })}
        />
      ) : null}
    </Stack>
  );
}

function FaceFields({ face, onChange }: { face: TokenFace; onChange: (face: TokenFace) => void }) {
  return (
    <Stack gap="sm">
      <Select
        label="Background"
        data={BACKGROUND_OPTIONS.map((key) => ({ value: key, label: key }))}
        value={face.background}
        onChange={(value) => value && onChange({ ...face, background: value })}
      />
      <Select
        label="Symbol"
        data={IMAGE_OPTIONS}
        value={face.image}
        onChange={(value) => value && onChange({ ...face, image: value })}
      />
      <div>
        <Text size="sm" fw={500} mb={4}>
          Symbol scale
        </Text>
        <Slider
          min={0.5}
          max={2}
          step={0.05}
          value={face.symbolScale}
          onChange={(value) => onChange({ ...face, symbolScale: value })}
          label={(v) => v.toFixed(2)}
        />
      </div>
      <TextInput
        label="Top label"
        description="Curves along the upper edge"
        value={face.top}
        onChange={(e) => onChange({ ...face, top: e.currentTarget.value })}
      />
      <Group grow>
        <TextInput
          label="Bottom line 1"
          description="Inner curve along the lower edge"
          value={face.bottom1}
          onChange={(e) => onChange({ ...face, bottom1: e.currentTarget.value })}
        />
        <TextInput
          label="Bottom line 2"
          description="Outer curve beneath it"
          value={face.bottom2}
          onChange={(e) => onChange({ ...face, bottom2: e.currentTarget.value })}
        />
      </Group>
    </Stack>
  );
}

/* ----------------------------- validation + page ----------------------------- */

const VALIDATION_STRIP_ID = 'token-validation-header';

type DraftWarning = { source: string; missing: string; chapter: string };

function draftWarnings(draft: TokenDraft): DraftWarning[] {
  const warnings: DraftWarning[] = [];
  if (!draft.name.trim()) warnings.push({ source: 'Identity', missing: 'a name', chapter: 'identity' });
  if (draft.backMode === 'token' && !draft.backTokenRef)
    warnings.push({ source: 'Identity', missing: 'a back token', chapter: 'identity' });
  if (draft.backMode === 'custom' && !draft.backFace?.image)
    warnings.push({ source: 'Back', missing: 'a symbol', chapter: 'back' });
  return warnings;
}

function ValidationStrip({ warnings, onFocus }: { warnings: DraftWarning[]; onFocus: (w: DraftWarning) => void }) {
  return (
    <Group gap="sm" justify="center">
      <Group gap={6}>
        <TriangleAlert size={15} aria-hidden />
        <Text size="sm" fw={700}>
          Incomplete fields
        </Text>
      </Group>
      {warnings.map((warning) => (
        <UnstyledButton
          key={`${warning.source}-${warning.missing}`}
          onClick={() => onFocus(warning)}
          style={{ borderRadius: 999, padding: '2px 10px', background: 'rgba(255,255,255,0.12)', fontSize: 13 }}
        >
          <strong>{warning.source}</strong>: missing {warning.missing}
        </UnstyledButton>
      ))}
    </Group>
  );
}

const panel = (children: ReactNode) => (
  <Stack gap="md" p="lg">
    {children}
  </Stack>
);

function TokenEditorPrototypePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<TokenDraft>(INITIAL_DRAFT);
  const [chapter, setChapter] = useState('identity');
  const patch: Patch = (update) => setDraft((prev) => ({ ...prev, ...update }));
  const warnings = draftWarnings(draft);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(INITIAL_DRAFT);
  const isNameBlank = !draft.name.trim();

  /* Identity | Front, plus Back only while a custom backside exists. Shape is never a tab —
     this page IS the round-token editor. */
  const tabs = [
    { value: 'identity', label: 'Identity', icon: <Signature size={21} aria-hidden />, panel: panel(<IdentityFields draft={draft} patch={patch} />) },
    { value: 'front', label: 'Front', icon: <Coins size={21} aria-hidden />, panel: panel(<FaceFields face={draft.front} onChange={(front) => patch({ front })} />) },
    ...(draft.backMode === 'custom'
      ? [
          {
            value: 'back',
            label: 'Back',
            icon: <FlipHorizontal2 size={21} aria-hidden />,
            panel: panel(
              <FaceFields face={draft.backFace as TokenFace} onChange={(backFace) => patch({ backFace })} />
            ),
          },
        ]
      : []),
  ];
  const activeChapter = tabs.some((tab) => tab.value === chapter) ? chapter : 'identity';

  return (
    <>
      <PageLayout>
        {warnings.length > 0 ? (
          <PageLayout.Header size="compact">
            <div id={VALIDATION_STRIP_ID}>
              <ValidationStrip warnings={warnings} onFocus={(warning) => setChapter(warning.chapter)} />
            </div>
          </PageLayout.Header>
        ) : null}
        <PageLayout.Toolbar>
          <Toolbar>
            <Toolbar.Left>
              <Group gap="sm" wrap="nowrap">
                <IconAction
                  label="Back"
                  variant="light"
                  color="gray"
                  size="lg"
                  onClick={() => void navigate({ to: '/assets' })}
                  icon={<ArrowLeft size={17} aria-hidden />}
                />
                <Stack gap={2}>
                  <Group gap="xs" wrap="nowrap">
                    <Badge color={isDirty ? 'orange' : 'gray'} variant="light">
                      {isDirty ? 'Unsaved changes' : 'No unsaved changes'}
                    </Badge>
                    {warnings.length > 0 ? (
                      <Button
                        type="button"
                        variant="subtle"
                        color="yellow"
                        size="compact-xs"
                        onClick={() =>
                          document.getElementById(VALIDATION_STRIP_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }
                      >
                        {warnings.length} {warnings.length === 1 ? 'field may' : 'fields may'} be incomplete
                      </Button>
                    ) : null}
                  </Group>
                  <Text size="xs" c="dimmed" role="status">
                    {isNameBlank
                      ? 'Add a token name before saving; it determines the token URL.'
                      : draft.backMode === 'custom'
                        ? 'New round token — saving it schedules both face images.'
                        : 'New round token — saving it schedules its public face image.'}
                  </Text>
                </Stack>
              </Group>
            </Toolbar.Left>
            <Toolbar.Right>
              <Group gap="xs" wrap="nowrap">
                <IconAction
                  label="Reset unsaved edits"
                  variant="light"
                  color="gray"
                  size="lg"
                  disabled={!isDirty}
                  onClick={() => setDraft(INITIAL_DRAFT)}
                  icon={<RotateCcw size={17} aria-hidden />}
                />
                <Button type="button" color="confirm" leftSection={<Save size={17} aria-hidden />} disabled={isNameBlank}>
                  Save token
                </Button>
              </Group>
            </Toolbar.Right>
          </Toolbar>
        </PageLayout.Toolbar>
        <PageLayout.Content>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(17rem, 21rem)',
              alignItems: 'start',
              width: '100%',
              maxWidth: '78rem',
              margin: '0 auto',
            }}
          >
            <ConnectedTabs value={activeChapter} onValueChange={setChapter} ariaLabel="Token chapters" items={tabs} />
            <div style={{ minWidth: 0, paddingLeft: 'var(--mantine-spacing-md)' }}>
              <div style={{ position: 'sticky', top: 96 }}>
                <RailProofs draft={draft} />
              </div>
            </div>
          </div>
        </PageLayout.Content>
      </PageLayout>
    </>
  );
}
