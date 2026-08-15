import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Image,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core';
import { FactionCard } from '@ui/block/FactionCard';
import { effectiveComplexity } from '@ui/content/complexity';
import { ComplexityGlyph } from '@ui/content/ComplexityGlyph';
import { TopicIcon } from '@ui/content/TopicIcon';
import { Surface } from '@ui/surface';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Globe2 } from 'lucide-react';
import { forwardRef, useImperativeHandle, useState } from 'react';

import type { FactionCatalogueEntry } from '@db/factions';
import { useAssetResolver } from '@game/assets/assetRenderMode';
import { AllianceCard } from '@game/assets/faction/alliance/Alliance';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token } from '@game/assets/faction/token/Token';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';

import { factionAuthoringChapters } from './factionAuthoringContract';
import type {
  FactionAuthoringChapterId,
  FactionAuthoringWarning,
} from './factionAuthoringContract';
import styles from './FactionEditor.module.css';
import { assetOptionToPreviewSrc } from './factionFormAssetUtils';
import { FactionFormSectionAdvantages } from './FactionFormSectionAdvantages';
import { FactionFormSectionAlliance } from './FactionFormSectionAlliance';
import { FactionFormSectionBackground } from './FactionFormSectionBackground';
import { FactionFormSectionComplexity } from './FactionFormSectionComplexity';
import { FactionFormSectionHero } from './FactionFormSectionHero';
import { FactionFormSectionIdentity } from './FactionFormSectionIdentity';
import { FactionFormSectionLeaders } from './FactionFormSectionLeaders';
import { FactionFormSectionPlanets } from './FactionFormSectionPlanets';
import { FactionFormSectionRules } from './FactionFormSectionRules';
import { FactionFormSectionTroops } from './FactionFormSectionTroops';
import type { FactionFormApi } from './factionFormTypes';

export type { FactionFormApi } from './factionFormTypes';

export interface FactionFormFieldsHandle {
  focusWarning: (warning: FactionAuthoringWarning) => void;
}

const chapterIcons: Record<
  Exclude<FactionAuthoringChapterId, 'identity' | 'worlds' | 'complexity'>,
  Parameters<typeof TopicIcon>[0]['topic']
> = {
  hero: 'hero',
  leaders: 'leaders',
  alliance: 'alliance',
  forces: 'troops',
  rules: 'rules',
  advantages: 'advantages',
};

function ChapterIcon({
  chapter,
  form,
}: {
  chapter: FactionAuthoringChapterId;
  form: FactionFormApi;
}) {
  if (chapter === 'identity') {
    return (
      <form.Subscribe selector={(state) => state.values.logo}>
        {(logo) => <Image src={assetOptionToPreviewSrc(logo)} alt="" w={22} h={22} fit="contain" />}
      </form.Subscribe>
    );
  }
  if (chapter === 'worlds') {
    return <Globe2 size={21} aria-hidden />;
  }
  if (chapter === 'complexity') {
    /* This tab's icon is live: the tier glyph of the current effective rating. */
    return (
      <form.Subscribe
        selector={(state) =>
          effectiveComplexity({ rules: state.values.rules, complexity: state.values.complexity })
        }
      >
        {(score) => <ComplexityGlyph score={score} size={21} decorative />}
      </form.Subscribe>
    );
  }
  return <TopicIcon topic={chapterIcons[chapter]} size={21} />;
}

function PreviewEmpty({ children }: { children: string }) {
  return (
    <Box className={styles.previewEmpty}>
      <Text c="dimmed" size="sm" ta="center">
        {children}
      </Text>
    </Box>
  );
}

function ArtifactProof({
  activeChapter,
  form,
  selectedItem,
}: {
  activeChapter: FactionAuthoringChapterId;
  form: FactionFormApi;
  selectedItem: {
    leader: number;
    world: number;
    troop: number;
    advantage: number;
  };
}) {
  const resolve = useAssetResolver();
  const [identityProof, setIdentityProof] = useState<'background' | 'token'>('background');

  return (
    <form.Subscribe selector={(state) => state.values}>
      {(faction) => {
        const selectedLeader =
          faction.leaders[Math.min(selectedItem.leader, faction.leaders.length - 1)];
        const selectedTroop =
          faction.troops[Math.min(selectedItem.troop, faction.troops.length - 1)];
        const worlds = faction.planet ?? [];
        const selectedWorld = worlds[Math.min(selectedItem.world, worlds.length - 1)];
        const selectedAdvantage =
          faction.rules.advantages[
            Math.min(selectedItem.advantage, faction.rules.advantages.length - 1)
          ];

        let title = 'Background composite';
        let usedOn = 'Faction sheet · faction token · leader tokens · troops · alliance card';
        let artifact: React.ReactNode = (
          <Box className={styles.squareProof}>
            {identityProof === 'background' ? (
              <BackgroundRenderer background={faction.background} />
            ) : (
              <Box className={styles.tokenProof} data-faction-token-proof>
                <Token background={faction.background} logo={faction.logo} />
              </Box>
            )}
          </Box>
        );

        if (activeChapter === 'hero') {
          title = 'Faction leader token';
          usedOn = 'Faction shield';
          artifact = (
            <Box className={styles.leaderProof}>
              <LeaderToken
                background={faction.background}
                image={faction.hero.image}
                logo={faction.logo}
                name={faction.hero.name}
                strength={undefined}
              />
            </Box>
          );
        } else if (activeChapter === 'leaders') {
          title = 'Supporting leader token';
          usedOn = 'Leader tokens';
          artifact = selectedLeader ? (
            <Box className={styles.leaderProof}>
              <LeaderToken
                background={faction.background}
                image={selectedLeader.image}
                logo={faction.logo}
                name={selectedLeader.name}
                strength={selectedLeader.strength}
              />
            </Box>
          ) : (
            <PreviewEmpty>No supporting leaders yet.</PreviewEmpty>
          );
        } else if (activeChapter === 'alliance') {
          title = 'Alliance card';
          usedOn = 'Alliance card';
          artifact = selectedTroop ? (
            <Box className={styles.cardProof}>
              <Box className={styles.cardCanvas}>
                <AllianceCard
                  background={faction.background}
                  decals={faction.decals}
                  logo={faction.logo}
                  text={faction.rules.alliance.text}
                  title={faction.name}
                  troop={selectedTroop.image}
                />
              </Box>
            </Box>
          ) : (
            <PreviewEmpty>Add a troop type to complete the alliance-card proof.</PreviewEmpty>
          );
        } else if (activeChapter === 'worlds') {
          title = 'Selected world';
          usedOn = 'Future planet asset';
          artifact = selectedWorld ? (
            <Box className={styles.planetProof}>
              <Image
                key={selectedWorld.image}
                src={resolve(selectedWorld.image)}
                alt={selectedWorld.name}
                fit="contain"
              />
            </Box>
          ) : (
            <PreviewEmpty>No faction worlds yet.</PreviewEmpty>
          );
        } else if (activeChapter === 'forces') {
          title = 'Selected troop token';
          usedOn = 'Troop supply · faction sheet';
          artifact = selectedTroop ? (
            <Box className={styles.troopProof}>
              <TroopToken
                background={faction.background}
                image={selectedTroop.image}
                star={selectedTroop.star}
                hue={selectedTroop.hue}
                striped={selectedTroop.striped}
              />
            </Box>
          ) : (
            <PreviewEmpty>No troop types yet.</PreviewEmpty>
          );
        } else if (activeChapter === 'rules') {
          title = 'Faction-sheet excerpt';
          usedOn = 'Faction sheet';
          artifact = (
            /* Paper, not a pane: this is an excerpt of the printed faction sheet, and it renders
               inside the workbench surface below — surfaces never nest. */
            <Box className={styles.rulesProof} p="lg">
              <Text ff="serif" fw={800} tt="uppercase">
                At start
              </Text>
              <Text ff="serif" size="sm">
                Starting spice: {faction.rules.spiceCount} · {faction.rules.startText}
              </Text>
              <Text ff="serif" fw={800} tt="uppercase" mt="md">
                Revival
              </Text>
              <Text ff="serif" size="sm">
                {faction.rules.revivalText}
              </Text>
            </Box>
          );
        } else if (activeChapter === 'advantages') {
          title = 'Advantage excerpt';
          usedOn = 'Faction sheet';
          artifact = selectedAdvantage ? (
            <Box className={styles.rulesProof} p="lg">
              <Text ff="serif" fw={800} tt="uppercase">
                {selectedAdvantage.title || 'Faction advantage'}
              </Text>
              <Text ff="serif" size="sm">
                {selectedAdvantage.text}
              </Text>
              {selectedAdvantage.karama ? (
                <Text ff="serif" size="sm" mt="md">
                  <strong>Karama:</strong> {selectedAdvantage.karama}
                </Text>
              ) : null}
            </Box>
          ) : (
            <PreviewEmpty>No faction advantages yet.</PreviewEmpty>
          );
        } else if (activeChapter === 'complexity') {
          title = 'Faction card';
          usedOn = 'Faction catalogue';
          /* The catalogue card carries the rating natively; `inert` keeps the proof's link out of
             both pointer and keyboard reach — tabbing into it would navigate the editor away. */
          artifact = (
            <Box inert>
              <FactionCard
                faction={
                  {
                    _id: 'complexity-proof',
                    slug: 'complexity-proof',
                    rulesets: [],
                    data: faction,
                  } as unknown as FactionCatalogueEntry
                }
              />
            </Box>
          );
        }

        return (
          <Surface
            padding="md"
            as="section"
            className={styles.artifactDesk}
            aria-label={`${title} live preview`}
          >
            {activeChapter === 'identity' ? (
              <Box className={styles.identityProof}>
                {artifact}
                <Box
                  className={styles.sheetColorReference}
                  style={{ backgroundColor: faction.themeColor }}
                >
                  <Text size="xs" fw={800} tt="uppercase">
                    Sheet color
                  </Text>
                  <Text size="xs" ff="monospace">
                    {faction.themeColor}
                  </Text>
                </Box>
              </Box>
            ) : (
              artifact
            )}

            {activeChapter === 'identity' ? (
              <SegmentedControl
                className={styles.proofSwitch}
                fullWidth
                value={identityProof}
                onChange={(value) => setIdentityProof(value === 'token' ? 'token' : 'background')}
                data={[
                  { value: 'background', label: 'Background' },
                  { value: 'token', label: 'Faction token' },
                ]}
                aria-label="Choose identity artifact proof"
              />
            ) : null}

            <Box className={styles.artifactMeta}>
              <Text size="xs" fw={800} tt="uppercase" c="dune.8" lts="0.12em">
                Artifact workbench
              </Text>
              <Text fw={700}>{title}</Text>
              <Text c="dimmed" size="xs">
                Used on: {usedOn}.
              </Text>
            </Box>
          </Surface>
        );
      }}
    </form.Subscribe>
  );
}

function ChapterWarnings({
  warnings,
  onFocus,
}: {
  warnings: FactionAuthoringWarning[];
  onFocus: (warning: FactionAuthoringWarning) => void;
}) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <Alert color="yellow" variant="light" title="These fields may be incomplete">
      <Group gap="xs">
        {warnings.map((warning) => (
          <Button
            key={warning.path}
            type="button"
            variant="subtle"
            color="yellow"
            size="compact-xs"
            px={0}
            onClick={() => onFocus(warning)}
          >
            {warning.label}
          </Button>
        ))}
      </Group>
    </Alert>
  );
}

export const FactionFormFields = forwardRef<
  FactionFormFieldsHandle,
  {
    form: FactionFormApi;
    warnings: FactionAuthoringWarning[];
    nameError?: string;
  }
>(function FactionFormFields({ form, warnings, nameError }, ref) {
  const [activeChapter, setActiveChapter] = useState<FactionAuthoringChapterId>('identity');
  const [retainedManualComplexity, setRetainedManualComplexity] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState({
    leader: 0,
    decal: 0,
    world: 0,
    troop: 0,
    advantage: 0,
  });
  const forChapter = (chapter: FactionAuthoringChapterId) =>
    warnings.filter((warning) => warning.chapter === chapter);

  const focusWarning = (warning: FactionAuthoringWarning) => {
    setActiveChapter(warning.chapter);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(warning.targetId);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.focus({ preventScroll: true });
    });
  };

  useImperativeHandle(ref, () => ({ focusWarning }));

  const chapterEditor = (chapter: FactionAuthoringChapterId) => (
    <>
      {chapter === 'identity' ? (
        <>
          <FactionFormSectionIdentity form={form} nameError={nameError} showIntro={false} />
          <FactionFormSectionBackground form={form} />
        </>
      ) : null}
      {chapter === 'hero' ? <FactionFormSectionHero form={form} showPreview={false} /> : null}
      {chapter === 'leaders' ? (
        <FactionFormSectionLeaders
          form={form}
          showPreview={false}
          selectedIndex={selectedItem.leader}
          onSelectedIndexChange={(leader) => setSelectedItem((current) => ({ ...current, leader }))}
        />
      ) : null}
      {chapter === 'alliance' ? (
        <FactionFormSectionAlliance
          form={form}
          showPreview={false}
          selectedDecalIndex={selectedItem.decal}
          onSelectedDecalIndexChange={(decal) =>
            setSelectedItem((current) => ({ ...current, decal }))
          }
        />
      ) : null}
      {chapter === 'worlds' ? (
        <FactionFormSectionPlanets
          form={form}
          selectedIndex={selectedItem.world}
          onSelectedIndexChange={(world) => setSelectedItem((current) => ({ ...current, world }))}
        />
      ) : null}
      {chapter === 'forces' ? (
        <FactionFormSectionTroops
          form={form}
          showPreview={false}
          selectedIndex={selectedItem.troop}
          onSelectedIndexChange={(troop) => setSelectedItem((current) => ({ ...current, troop }))}
        />
      ) : null}
      {chapter === 'rules' ? <FactionFormSectionRules form={form} /> : null}
      {chapter === 'advantages' ? (
        <FactionFormSectionAdvantages
          form={form}
          selectedIndex={selectedItem.advantage}
          onSelectedIndexChange={(advantage) =>
            setSelectedItem((current) => ({ ...current, advantage }))
          }
        />
      ) : null}
      {chapter === 'complexity' ? (
        <FactionFormSectionComplexity
          form={form}
          retainedManualRating={retainedManualComplexity}
          onRetainedManualRatingChange={setRetainedManualComplexity}
        />
      ) : null}
    </>
  );

  const connectedTabItems = factionAuthoringChapters.map((chapter) => {
    const chapterWarnings = forChapter(chapter.id);
    return {
      value: chapter.id,
      label: chapter.label,
      icon: <ChapterIcon chapter={chapter.id} form={form} />,
      indicator:
        chapterWarnings.length > 0 ? (
          <Badge circle size="sm" color="yellow">
            {chapterWarnings.length}
          </Badge>
        ) : undefined,
      panel: (
        <Stack gap="lg">
          <ChapterWarnings warnings={chapterWarnings} onFocus={focusWarning} />
          {chapterEditor(chapter.id)}
        </Stack>
      ),
    };
  });

  return (
    <div className={styles.workbench}>
      <ConnectedTabs
        className={styles.connectedTabs}
        value={activeChapter}
        onValueChange={setActiveChapter}
        items={connectedTabItems}
        ariaLabel="Faction editor sections"
      />
      <Box className={styles.artifactColumn}>
        <ArtifactProof activeChapter={activeChapter} form={form} selectedItem={selectedItem} />
      </Box>
    </div>
  );
});
