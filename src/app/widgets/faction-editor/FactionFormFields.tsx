import { Badge, Box, Image, Stack, Text } from '@mantine/core';
import { recalculateFactionComplexity } from '@shared/factions/complexity';
import { FactionCard } from '@ui/block/FactionCard';
import { effectiveComplexity } from '@ui/content/complexity';
import { ComplexityGlyph } from '@ui/content/ComplexityGlyph';
import { FormattedTextSource, InlineFormattedTextSource } from '@ui/content/FormattedText';
import { TopicIcon } from '@ui/content/TopicIcon';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Globe2, Swords } from 'lucide-react';
import { forwardRef, useImperativeHandle, useState } from 'react';

import type { Faction, FactionCatalogueEntry } from '@db/factions';
import type { BackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import { useAssetResolver } from '@game/assets/assetRenderMode';
import { AllianceCard } from '@game/assets/faction/alliance/Alliance';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token } from '@game/assets/faction/token/Token';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';
import { card as CARD_SIZE } from '@game/data/sizes';

import { factionAuthoringChapters } from './factionAuthoringContract';
import type { FactionAuthoringChapterId, FactionAuthoringWarning } from './factionAuthoringContract';
import styles from './FactionEditor.module.css';
import { FactionFormSectionAdvantages } from './FactionFormSectionAdvantages';
import { FactionFormSectionAlliance } from './FactionFormSectionAlliance';
import { FactionFormSectionBackground } from './FactionFormSectionBackground';
import { FactionFormSectionComplexity } from './FactionFormSectionComplexity';
import { FactionFormSectionHero } from './FactionFormSectionHero';
import { FactionFormSectionIdentity } from './FactionFormSectionIdentity';
import type { FactionIdentityNameField } from './FactionFormSectionIdentity';
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
  Exclude<FactionAuthoringChapterId, 'identity' | 'forces' | 'worlds' | 'complexity'>,
  Parameters<typeof TopicIcon>[0]['topic']
> = {
  hero: 'hero',
  leaders: 'leaders',
  alliance: 'alliance',
  rules: 'rules',
  advantages: 'advantages',
};

/* The tab glyph when the faction has no troops yet. */
function ChapterIcon({ chapter, form }: { chapter: FactionAuthoringChapterId; form: FactionFormApi }) {
  if (chapter === 'identity') {
    return <TopicIcon topic="identity" size={21} />;
  }
  if (chapter === 'forces') {
    return <Swords size={21} aria-hidden />;
  }
  if (chapter === 'worlds') {
    return <Globe2 size={21} aria-hidden />;
  }
  if (chapter === 'complexity') {
    /* This tab's icon is live: the tier glyph of the current effective rating. */
    return (
      <form.Subscribe
        selector={(state) =>
          effectiveComplexity(
            recalculateFactionComplexity({
              rules: state.values.rules,
              complexity: state.values.complexity,
            }).complexity
          )
        }
      >
        {(score) => <ComplexityGlyph score={score} size={21} decorative />}
      </form.Subscribe>
    );
  }
  return <TopicIcon topic={chapterIcons[chapter]} size={21} />;
}

/* A two-sided troop turns inside the rail's round crop; one-sided troops render a single face. */
function TroopFlipToken({
  background,
  troop,
  side,
}: {
  background: Faction['background'];
  troop: Faction['troops'][number];
  side: 'front' | 'back';
}) {
  const back = troop.back;
  if (!back) {
    return (
      <div className={styles.tokenCrop}>
        <TroopToken
          background={background}
          image={troop.image}
          star={troop.star}
          hue={troop.hue}
          striped={troop.striped}
        />
      </div>
    );
  }
  return (
    <div className={styles.flipScene}>
      <div className={styles.flipCard} data-flipped={side === 'back' || undefined}>
        <div className={styles.flipFace}>
          <TroopToken
            background={background}
            image={troop.image}
            star={troop.star}
            hue={troop.hue}
            striped={troop.striped}
          />
        </div>
        <div className={`${styles.flipFace} ${styles.flipBack}`}>
          <TroopToken
            background={background}
            image={back.image}
            star={back.star}
            hue={back.hue}
            striped={back.striped}
          />
        </div>
      </div>
    </div>
  );
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
  troopSide,
}: {
  activeChapter: FactionAuthoringChapterId;
  form: FactionFormApi;
  selectedItem: {
    leader: number;
    world: number;
    troop: number;
    advantage: number;
  };
  troopSide: Record<number, 'front' | 'back'>;
}) {
  const resolve = useAssetResolver();

  return (
    <form.Subscribe selector={(state) => state.values}>
      {(faction) => {
        const selectedLeader = faction.leaders[Math.min(selectedItem.leader, faction.leaders.length - 1)];
        const selectedTroop = faction.troops[Math.min(selectedItem.troop, faction.troops.length - 1)];
        const worlds = faction.planet ?? [];
        const selectedWorld = worlds[Math.min(selectedItem.world, worlds.length - 1)];
        const selectedAdvantage =
          faction.rules.advantages[Math.min(selectedItem.advantage, faction.rules.advantages.length - 1)];

        let title = 'Background composite';
        let artifact: React.ReactNode = (
          <Box className={styles.squareProof}>
            <BackgroundRenderer background={faction.background} />
          </Box>
        );

        if (activeChapter === 'hero') {
          title = 'Faction leader token';
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
          title = 'Supporting leader tokens';
          artifact = selectedLeader ? (
            <>
              <Box className={styles.leaderProof}>
                <LeaderToken
                  background={faction.background}
                  image={selectedLeader.image}
                  logo={faction.logo}
                  name={selectedLeader.name}
                  strength={selectedLeader.strength}
                />
              </Box>
              {faction.leaders.length > 1 ? (
                <Box className={styles.leaderGrid}>
                  {faction.leaders.map((leader, index) =>
                    leader === selectedLeader ? null : (
                      <Box key={index} className={styles.leaderThumb}>
                        <LeaderToken
                          background={faction.background}
                          image={leader.image}
                          logo={faction.logo}
                          name={leader.name}
                          strength={leader.strength}
                        />
                      </Box>
                    )
                  )}
                </Box>
              ) : null}
            </>
          ) : (
            <PreviewEmpty>No supporting leaders yet.</PreviewEmpty>
          );
        } else if (activeChapter === 'alliance') {
          title = 'Alliance card';
          artifact = selectedTroop ? (
            <CanvasScale
              canvasWidth={CARD_SIZE.width}
              canvasHeight={CARD_SIZE.height}
              frameClassName={styles.cardProof}
            >
              <AllianceCard
                background={faction.background}
                decals={faction.decals}
                logo={faction.logo}
                text={faction.rules.alliance.text}
                title={faction.name}
                troop={selectedTroop.image}
              />
            </CanvasScale>
          ) : (
            <PreviewEmpty>Add a troop type to complete the alliance-card proof.</PreviewEmpty>
          );
        } else if (activeChapter === 'worlds') {
          title = 'Faction planets';
          artifact = selectedWorld ? (
            /* Like the leaders roster, but unclipped and unshadowed: these are
               arbitrary transparent PNGs, not pane-shaped pieces. */
            <>
              <Box className={styles.planetProof}>
                <Image
                  key={selectedWorld.image}
                  src={resolve(selectedWorld.image)}
                  alt={selectedWorld.name}
                  fit="contain"
                />
              </Box>
              {worlds.length > 1 ? (
                <Box className={styles.planetGrid}>
                  {worlds.map((world, index) =>
                    world === selectedWorld ? null : (
                      <Image key={index} src={resolve(world.image)} alt={world.name} fit="contain" />
                    )
                  )}
                </Box>
              ) : null}
            </>
          ) : (
            <PreviewEmpty>No planets yet.</PreviewEmpty>
          );
        } else if (activeChapter === 'forces') {
          const selectedTroopIndex = Math.min(selectedItem.troop, faction.troops.length - 1);
          title = 'Troop tokens';
          artifact = selectedTroop ? (
            /* The whole roster, leaders-fashion: focused troop on top, the rest below.
               Each token shows the side currently chosen in its editor tabs. */
            <>
              <Box className={styles.troopProof}>
                <TroopFlipToken
                  background={faction.background}
                  troop={selectedTroop}
                  side={troopSide[selectedTroopIndex] ?? 'front'}
                />
              </Box>
              {faction.troops.length > 1 ? (
                <Box className={styles.troopGrid}>
                  {faction.troops.map((troop, index) =>
                    troop === selectedTroop ? null : (
                      <TroopFlipToken
                        key={index}
                        background={faction.background}
                        troop={troop}
                        side={troopSide[index] ?? 'front'}
                      />
                    )
                  )}
                </Box>
              ) : null}
            </>
          ) : (
            <PreviewEmpty>No troop types yet.</PreviewEmpty>
          );
        } else if (activeChapter === 'rules') {
          title = 'Faction-sheet excerpt';
          artifact = (
            /* Paper, not a pane: this is an excerpt of the printed faction sheet, and it renders
               inside the workbench surface below, and surfaces never nest. */
            <Box className={styles.rulesProof} p="lg">
              <Text ff="serif" fw={800} tt="uppercase">
                At start
              </Text>
              <Text ff="serif" size="sm">
                Starting spice: {faction.rules.spiceCount} ·{' '}
                <InlineFormattedTextSource source={faction.rules.startText} />
              </Text>
              <Text ff="serif" fw={800} tt="uppercase" mt="md">
                Revival
              </Text>
              <Text ff="serif" size="sm">
                <InlineFormattedTextSource source={faction.rules.revivalText} />
              </Text>
            </Box>
          );
        } else if (activeChapter === 'advantages') {
          title = 'Advantage excerpt';
          artifact = selectedAdvantage ? (
            <Box className={styles.rulesProof} p="lg">
              <Text ff="serif" fw={800} tt="uppercase">
                {selectedAdvantage.title || 'Faction advantage'}
              </Text>
              <FormattedTextSource source={selectedAdvantage.text} size="sm" />
              {selectedAdvantage.karama ? (
                <Box mt="md">
                  <Text ff="serif" size="sm" fw={700}>
                    Karama
                  </Text>
                  <FormattedTextSource source={selectedAdvantage.karama} size="sm" />
                </Box>
              ) : null}
            </Box>
          ) : (
            <PreviewEmpty>No faction advantages yet.</PreviewEmpty>
          );
        } else if (activeChapter === 'complexity') {
          title = 'Faction card';
          /* The catalogue card carries the rating natively; `inert` keeps the proof's link out of
             both pointer and keyboard reach, since tabbing into it would navigate the editor away. */
          artifact = (
            <Box inert>
              <FactionCard
                faction={
                  {
                    _id: 'complexity-proof',
                    slug: 'complexity-proof',
                    rulesets: [],
                    data: recalculateFactionComplexity(faction),
                  } as unknown as FactionCatalogueEntry
                }
              />
            </Box>
          );
        }

        return (
          /* Deliberately unboxed: the artifacts float on the page, stacked
             with the desk's gap, and no pane, toggle, or caption around them. */
          <Box component="section" className={styles.artifactDesk} aria-label={`${title} live preview`}>
            {activeChapter === 'identity' ? (
              <>
                <Box className={styles.tokenProof} data-faction-token-proof>
                  <Token background={faction.background} logo={faction.logo} />
                </Box>
                <Box className={styles.identityProof}>
                  {artifact}
                  <Box className={styles.sheetColorReference} style={{ backgroundColor: faction.themeColor }}>
                    <Text size="xs" fw={800} tt="uppercase">
                      Sheet color
                    </Text>
                    <Text size="xs" ff="monospace">
                      {faction.themeColor}
                    </Text>
                  </Box>
                </Box>
              </>
            ) : (
              artifact
            )}
          </Box>
        );
      }}
    </form.Subscribe>
  );
}

export const FactionFormFields = forwardRef<
  FactionFormFieldsHandle,
  {
    form: FactionFormApi;
    warnings: FactionAuthoringWarning[];
    nameError?: string;
    nameField?: FactionIdentityNameField;
    /** Fires on field blur and chapter switch so the route's validation header can settle closed. */
    onSettle?: () => void;
    /** The background composer's colour-mode memory, owned by the authoring session so a Reset discards it. */
    backgroundModeMemory: BackgroundModeMemory;
    onBackgroundModeMemoryChange: (memory: BackgroundModeMemory) => void;
  }
>(function FactionFormFields(
  { form, warnings, nameError, nameField, onSettle, backgroundModeMemory, onBackgroundModeMemoryChange },
  ref
) {
  const [activeChapter, setActiveChapter] = useState<FactionAuthoringChapterId>('identity');
  const [retainedManualComplexity, setRetainedManualComplexity] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState({
    leader: 0,
    world: 0,
    troop: 0,
    advantage: 0,
  });
  const [troopSideByIndex, setTroopSideByIndex] = useState<Record<number, 'front' | 'back'>>({});
  const forChapter = (chapter: FactionAuthoringChapterId) => warnings.filter((warning) => warning.chapter === chapter);

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
          <FactionFormSectionIdentity form={form} nameError={nameError} nameField={nameField} showIntro={false} />
          <FactionFormSectionBackground
            form={form}
            modeMemory={backgroundModeMemory}
            onModeMemoryChange={onBackgroundModeMemoryChange}
          />
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
      {chapter === 'alliance' ? <FactionFormSectionAlliance form={form} showPreview={false} /> : null}
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
          sideByIndex={troopSideByIndex}
          onSideByIndexChange={setTroopSideByIndex}
        />
      ) : null}
      {chapter === 'rules' ? <FactionFormSectionRules form={form} /> : null}
      {chapter === 'advantages' ? (
        <FactionFormSectionAdvantages
          form={form}
          selectedIndex={selectedItem.advantage}
          onSelectedIndexChange={(advantage) => setSelectedItem((current) => ({ ...current, advantage }))}
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
      panel: <Stack gap="lg">{chapterEditor(chapter.id)}</Stack>,
    };
  });

  return (
    <div className={styles.workbench} onBlur={() => onSettle?.()}>
      <ConnectedTabs
        className={styles.connectedTabs}
        value={activeChapter}
        onValueChange={(chapter) => {
          setActiveChapter(chapter);
          onSettle?.();
        }}
        items={connectedTabItems}
        ariaLabel="Faction editor sections"
      />
      <Box className={styles.artifactColumn}>
        <ArtifactProof
          activeChapter={activeChapter}
          form={form}
          selectedItem={selectedItem}
          troopSide={troopSideByIndex}
        />
      </Box>
    </div>
  );
});
