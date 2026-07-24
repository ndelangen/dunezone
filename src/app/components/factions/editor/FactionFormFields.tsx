import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Image,
  Paper,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Globe2 } from 'lucide-react';
import { useState } from 'react';

import { TopicIcon } from '@app/components/topics/TopicIcon';
import { AllianceCard } from '@game/assets/faction/alliance/Alliance';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token } from '@game/assets/faction/token/Token';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';

import styles from './FactionEditor.module.css';
import { FactionFormSectionAdvantages } from './FactionFormSectionAdvantages';
import { FactionFormSectionAlliance } from './FactionFormSectionAlliance';
import { FactionFormSectionBackground } from './FactionFormSectionBackground';
import { FactionFormSectionHero } from './FactionFormSectionHero';
import { FactionFormSectionIdentity } from './FactionFormSectionIdentity';
import { FactionFormSectionLeaders } from './FactionFormSectionLeaders';
import { FactionFormSectionPlanets } from './FactionFormSectionPlanets';
import { FactionFormSectionRules } from './FactionFormSectionRules';
import { FactionFormSectionTroops } from './FactionFormSectionTroops';
import {
  type FactionAuthoringChapterId,
  type FactionAuthoringWarning,
  factionAuthoringChapters,
} from './factionAuthoringContract';
import { assetOptionToPreviewSrc } from './factionFormAssetUtils';
import type { FactionFormApi } from './factionFormTypes';

export type { FactionFormApi } from './factionFormTypes';

const chapterIcons: Record<
  Exclude<FactionAuthoringChapterId, 'identity' | 'worlds'>,
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
  if (chapter === 'worlds') return <Globe2 size={21} aria-hidden />;
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
              <Box className={styles.tokenProof}>
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
                src={selectedWorld.image}
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
            <Paper className={styles.rulesProof} withBorder p="lg">
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
            </Paper>
          );
        } else if (activeChapter === 'advantages') {
          title = 'Advantage excerpt';
          usedOn = 'Faction sheet';
          artifact = selectedAdvantage ? (
            <Paper className={styles.rulesProof} withBorder p="lg">
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
            </Paper>
          ) : (
            <PreviewEmpty>No faction advantages yet.</PreviewEmpty>
          );
        }

        return (
          <Paper
            className={styles.artifactDesk}
            withBorder
            radius="lg"
            p="md"
            style={{ backgroundColor: 'var(--mantine-color-white)' }}
          >
            <Badge className={styles.liveBadge} color="teal" variant="light">
              Live
            </Badge>

            {activeChapter === 'identity' ? (
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
            ) : null}

            {artifact}

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
          </Paper>
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
  if (warnings.length === 0) return null;
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

export function FactionFormFields({
  form,
  warnings,
  nameError,
}: {
  form: FactionFormApi;
  warnings: FactionAuthoringWarning[];
  nameError?: string;
}) {
  const isMobile = useMediaQuery('(max-width: 48em)', false);
  const [activeChapter, setActiveChapter] = useState<FactionAuthoringChapterId>('identity');
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
    if (!isMobile) setActiveChapter(warning.chapter);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(warning.targetId);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.focus({ preventScroll: true });
    });
  };

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
    </>
  );

  if (isMobile) {
    return (
      <Stack className={styles.mobileDocument} gap="md">
        {factionAuthoringChapters.map((chapter, index) => {
          const chapterWarnings = forChapter(chapter.id);
          const headingId = `mobile-faction-chapter-${chapter.id}`;
          return (
            <Box
              component="section"
              className={styles.mobileChapter}
              key={chapter.id}
              aria-labelledby={headingId}
            >
              <Group className={styles.mobileChapterHeading} gap="sm" wrap="nowrap">
                <ChapterIcon chapter={chapter.id} form={form} />
                <Text component="span" className={styles.chapterNumber}>
                  {String(index + 1).padStart(2, '0')}
                </Text>
                <Text id={headingId} component="h2" fw={700} size="md">
                  {chapter.label}
                </Text>
                {chapterWarnings.length > 0 ? (
                  <Badge circle size="sm" color="yellow" ml="auto">
                    {chapterWarnings.length}
                  </Badge>
                ) : null}
              </Group>
              <Stack gap="lg" p="md">
                <ChapterWarnings warnings={chapterWarnings} onFocus={focusWarning} />
                {chapterEditor(chapter.id)}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    );
  }

  return (
    <Tabs
      className={styles.workbench}
      value={activeChapter}
      onChange={(value) => {
        if (value) setActiveChapter(value as FactionAuthoringChapterId);
      }}
      orientation="vertical"
      keepMounted={false}
    >
      <Tabs.List className={styles.chapterTabs} aria-label="Faction editor sections">
        {factionAuthoringChapters.map((chapter, index) => {
          const chapterWarnings = forChapter(chapter.id);
          return (
            <Tabs.Tab
              className={styles.chapterTab}
              key={chapter.id}
              value={chapter.id}
              leftSection={<ChapterIcon chapter={chapter.id} form={form} />}
              rightSection={
                chapterWarnings.length > 0 ? (
                  <Badge circle size="sm" color="yellow">
                    {chapterWarnings.length}
                  </Badge>
                ) : undefined
              }
            >
              <Text component="span" className={styles.chapterNumber}>
                {String(index + 1).padStart(2, '0')}
              </Text>
              <Text component="span" fw={700}>
                {chapter.label}
              </Text>
            </Tabs.Tab>
          );
        })}
      </Tabs.List>

      <Box className={styles.editorPlane}>
        {factionAuthoringChapters.map((chapter) => (
          <Tabs.Panel key={chapter.id} value={chapter.id} className={styles.editorPanel}>
            <Stack gap="lg">
              <ChapterWarnings warnings={forChapter(chapter.id)} onFocus={focusWarning} />
              {chapterEditor(chapter.id)}
            </Stack>
          </Tabs.Panel>
        ))}
      </Box>

      <Box className={styles.artifactColumn} visibleFrom="sm">
        <ArtifactProof activeChapter={activeChapter} form={form} selectedItem={selectedItem} />
      </Box>
    </Tabs>
  );
}
