import { Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import type { BundleAsset } from '@shared/assets/schema';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { AssetFace } from '@app/widgets/asset-face/AssetFace';
import { BundleContainer } from '@app/widgets/asset-face/BundleContainer';
import type { BundleBandData } from '@app/widgets/asset-face/BundleContainer';
import { BackgroundPresetControl } from '@app/widgets/background-composer/BackgroundPresetControl';
import { backgroundPresets } from '@game/data/backgrounds';

import { STOCK_BANDS, stockBandKeyFor } from './stockBands';

export type BundleDraft = z.infer<typeof BundleAsset>;
export type BundleChapter = 'identity' | 'tokens' | 'about';

/** One member of a bundle as the editor sees it: the token itself, and how many the bundle holds. */
export type BundleMember = { token: { id: string; name: string; type: string; data: unknown }; count: number };

const BAND_PRESETS = [
  { key: 'tech', label: 'Tech', background: backgroundPresets.special },
  { key: 'weapon', label: 'Weapon', background: backgroundPresets.weapon },
  { key: 'defense', label: 'Defense', background: backgroundPresets.defense },
  { key: 'worthless', label: 'Worthless', background: backgroundPresets.worthless },
];

/* A bundle without a band would have no face at all, so a fresh one starts on the first stock option. */
export const INITIAL_BUNDLE_DRAFT: BundleDraft = {
  name: '',
  about: '',
  band: STOCK_BANDS[0]!.band,
};

const CUSTOM = 'custom';

function BandFields({ band, onChange }: { band: BundleBandData; onChange: (next: BundleBandData) => void }) {
  return (
    <>
      <ControlBlock
        title="Label"
        description="The word across the band. Falls back to the bundle's name when blank."
        input={
          <TextInput
            aria-label="Label"
            value={band.label}
            onChange={(event) => onChange({ ...band, label: event.currentTarget.value })}
          />
        }
      />
      <BackgroundPresetControl
        title="Band"
        description="Behind the label."
        usedOn="this bundle's band"
        presets={BAND_PRESETS}
        value={band.background}
        onChange={(background) => onChange({ ...band, background })}
      />
    </>
  );
}

export type BundleWarning = { source: string; missing: string; chapter: BundleChapter };

export function bundleDraftWarnings(draft: BundleDraft, members: BundleMember[]): BundleWarning[] {
  const warnings: BundleWarning[] = [];
  if (members.length === 0) {
    warnings.push({ source: 'Tokens', missing: 'any tokens', chapter: 'tokens' });
  }
  /* No warning for a blank label: the container falls back to the name, so blank is a real choice rather than a gap. */
  if (!draft.name.trim()) {
    warnings.push({ source: 'Identity', missing: 'a name', chapter: 'identity' });
  }
  return warnings;
}

/* No padding here: ConnectedTabs' panel shell owns the panel inset. */
const panel = (children: ReactNode) => <Stack gap="lg">{children}</Stack>;

/**
 * The bundle workbench.
 *
 * A bundle is a container of tokens and nothing else, so this is the deck editor's shape with two differences that both come from decisions rather than taste: the authored face is a band rather than a Cardback, and there is no publication anywhere on the page, because a bundle publishes nothing («Bundles: a token container Asset type»).
 * The toolbar says so rather than showing a publication line that would never fill in.
 *
 * Membership is not draft state.
 * Each count change writes an `asset_relations` row immediately, the way a deck's composition does, because relations do not travel through the asset's `data`.
 */
export function BundleEditor({
  draft,
  patch,
  chapter,
  onChapterChange,
  onSettle,
  members,
  onCountChange,
  tokenPicker,
}: {
  draft: BundleDraft;
  patch: (update: Partial<BundleDraft>) => void;
  chapter: BundleChapter;
  onChapterChange: (chapter: BundleChapter) => void;
  onSettle: () => void;
  /** Saved membership, straight from the server. Empty while the bundle has never been saved. */
  members: BundleMember[];
  /** Zero removes the token. Null while the bundle has no id yet, which disables the steppers. */
  onCountChange: ((tokenId: string, count: number) => void) | null;
  tokenPicker: ReactNode;
}) {
  const stockKey = stockBandKeyFor(draft.band);
  const selected = stockKey ?? CUSTOM;
  const totalTokens = members.reduce((sum, member) => sum + member.count, 0);

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(17rem, 21rem)', alignItems: 'start' }}
      onBlurCapture={onSettle}
    >
      <ConnectedTabs<BundleChapter>
        value={chapter}
        onValueChange={(next) => {
          onChapterChange(next);
          onSettle();
        }}
        ariaLabel="Bundle chapters"
        items={[
          {
            value: 'identity',
            label: 'Identity',
            icon: <TopicIcon topic="identity" size={21} />,
            panel: panel(
              <>
                <ControlBlock
                  title="Name"
                  description="Determines the bundle's URL."
                  input={
                    <TextInput
                      aria-label="Name"
                      value={draft.name}
                      onChange={(event) => patch({ name: event.currentTarget.value })}
                    />
                  }
                />
                <ControlBlock
                  title="Band"
                  description="A bundle has no face of its own, so this is what tells it apart. Stock or authored; nothing about the choice is stored either way."
                  input={
                    <Select
                      aria-label="Band"
                      allowDeselect={false}
                      data={[
                        ...STOCK_BANDS.map((stock) => ({ value: stock.key, label: `${stock.label} band` })),
                        { value: CUSTOM, label: 'Custom…' },
                      ]}
                      value={selected}
                      onChange={(next) => {
                        const stock = STOCK_BANDS.find((candidate) => candidate.key === next);
                        if (stock) {
                          patch({ band: stock.band });
                        }
                        /* Choosing Custom keeps the current composition and simply reveals the fields below. */
                      }}
                    />
                  }
                />
                {selected === CUSTOM ? <BandFields band={draft.band} onChange={(band) => patch({ band })} /> : null}
              </>
            ),
          },
          {
            value: 'tokens',
            label: 'Tokens',
            icon: <TopicIcon topic="contents" size={21} />,
            panel: panel(
              <>
                <ControlBlock
                  title="Contents"
                  description="Which tokens this bundle holds, and how many of each. Shapes may be mixed freely."
                  input={
                    members.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        No tokens yet.
                      </Text>
                    ) : (
                      <Stack gap="xs">
                        {members.map((member) => (
                          <Group key={member.token.id} gap="sm" wrap="nowrap" align="center">
                            <AssetFace
                              type={member.token.type}
                              data={member.token.data}
                              name={member.token.name}
                              width={34}
                            />
                            <Text size="sm" style={{ flex: 1, minWidth: 0 }}>
                              {member.token.name}
                            </Text>
                            <NumberInput
                              aria-label={`How many ${member.token.name}`}
                              min={1}
                              max={99}
                              w={90}
                              disabled={onCountChange === null}
                              value={member.count}
                              onChange={(value) => onCountChange?.(member.token.id, Number(value) || 1)}
                            />
                            <IconAction
                              label={`Remove ${member.token.name}`}
                              variant="light"
                              color="red"
                              size="lg"
                              disabled={onCountChange === null}
                              onClick={() => onCountChange?.(member.token.id, 0)}
                              icon={<Trash2 size={17} aria-hidden />}
                            />
                          </Group>
                        ))}
                      </Stack>
                    )
                  }
                />
                <ControlBlock
                  title="Add tokens"
                  description="Every community token is available, whoever made it."
                  input={tokenPicker}
                />
              </>
            ),
          },
          aboutChapter(draft.about, (about) => patch({ about })),
        ]}
      />
      <div style={{ minWidth: 0, paddingLeft: 'var(--mantine-spacing-md)' }}>
        <div style={{ position: 'sticky', top: 96 }}>
          <Stack gap="md" align="center">
            <BundleContainer band={draft.band} name={draft.name} width={220} />
            <Text size="xs" c="dimmed">
              How this bundle is shown
            </Text>
            <Text size="sm">
              {totalTokens} {totalTokens === 1 ? 'token' : 'tokens'} across {members.length}{' '}
              {members.length === 1 ? 'kind' : 'kinds'}
            </Text>
          </Stack>
        </div>
      </div>
    </div>
  );
}
