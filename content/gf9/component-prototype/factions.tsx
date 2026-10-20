import { FactionSheetPage1, FactionSheetPage2 } from '../../../src/game/assets/faction/sheet/Sheet';
import sheetStyles from '../../../src/game/assets/faction/sheet/Sheet.module.css';
import { isLight } from '../../../src/game/assets/utils/contrast';
import { assetPublishingFaction } from '../../../src/shared/factions/fixtures/assetPublishingFaction';
import { FactionRender } from '../../../src/shared/factions/schema';
import { choamBackground } from './art';
import audit from './content-audit.json';
import './factions.css';

export type FactionReviewProps = {
  frame?: boolean;
  faction?: string;
  variant?: 'baseline' | 'proposed';
  page?: 1 | 2;
};

export const factionReviewNames = audit.factions.map(({ key, proposedName }) => ({ key, name: proposedName }));

function factionData(key: string, variant: 'baseline' | 'proposed') {
  if (key === 'reversible-example') {
    const data = structuredClone(assetPublishingFaction);
    data.name = 'Atreides reversible troop example';
    data.rules.advantages = data.rules.advantages.slice(0, 4);
    data.troops = [
      {
        ...data.troops[0],
        name: 'Arrakeen garrison',
        description: 'Front face.',
        count: 20,
        back: {
          image: data.troops[0].image,
          name: 'Desert patrol',
          description: 'Back face.',
          striped: true,
        },
      },
    ];
    return FactionRender.sheet.parse(data);
  }
  const record = audit.factions.find((item) => item.key === key) ?? audit.factions[5];
  const data = structuredClone(record.data);
  if (variant === 'proposed') {
    data.name = record.proposedName;
    if (record.key === 'choam') Object.assign(data, { background: choamBackground });
    const restoredNames: Record<string, string> = {
      'c6c37ae9-932e-460f-826d-5b9553693b5d': 'Captain Iakin Nefud',
      '5a19b7d3-0256-4013-8478-8343a47f8a46': 'Margot Lady Fenring',
      '0c17e2fb-bb4b-5658-a1fe-a31ce1d5a793': 'Premier Ein Calimar',
    };
    data.leaders = data.leaders.map((leader) => ({
      ...leader,
      name: restoredNames[leader.memberId ?? ''] ?? leader.name,
    }));
    if (data.rules.fate.title) {
      data.rules.fate.title = data.rules.fate.title.replace(/:\s*$/, '').trim();
      if (record.key === 'bene-gesserit') data.rules.fate.title = 'No special power';
    }
    if (record.key === 'ecaz') {
      const revival = data.rules.advantages.find((rule) => rule.title === 'Duke Vidal revival');
      if (revival)
        revival.text =
          'Only you may revive Duke Vidal, including with a Ghola Card. You may pay 5 spice to revive him regardless of how many other leaders are in the Tanks. Revival returns him to the set-aside supply. You may revive your other leaders normally when at least 5 of your leaders, counting Vidal, are in the Tanks, even if another remains alive.';
    }
  }
  return FactionRender.sheet.parse(data);
}

/** Isolated frame is required because the existing sheet renderer sizes typography in viewport units. */
export function FactionReview({
  frame = false,
  faction = 'bene-gesserit',
  variant = 'proposed',
  page = 2,
}: FactionReviewProps) {
  const data = factionData(faction, variant);
  if (frame) {
    const headerTextColor = isLight(data.themeColor) ? 'black' : 'white';
    return (
      <div className={`gf9-faction-frame gf9-faction-${variant}`}>
        <style>{`
          .gf9-faction-frame { --header-bg-color: ${data.themeColor}; --header-text-color: ${headerTextColor}; }
          .gf9-faction-proposed .${sheetStyles.troop} > div:not(:has(svg)) {
            width: auto; flex: 0 0 auto; aspect-ratio: auto; border-radius: 0; overflow: visible;
          }
        `}</style>
        <div className={sheetStyles.container}>
          {page === 1 ? <FactionSheetPage1 {...data} /> : <FactionSheetPage2 {...data} />}
        </div>
      </div>
    );
  }
  const frameUrl = (nextVariant: 'baseline' | 'proposed') => {
    const url = new URL(window.location.href);
    url.searchParams.set('frame', 'sheet');
    url.searchParams.set('faction', faction);
    url.searchParams.set('variant', nextVariant);
    url.searchParams.set('sheetPage', String(page));
    return url.toString();
  };
  return (
    <section className="gf9-faction-review">
      <p>
        The sheets use the existing A4 renderer. These views isolate the real viewport before scaling to the review
        panel.
      </p>
      <div className="gf9-faction-comparison">
        {(['baseline', 'proposed'] as const).map((item) => (
          <figure key={item}>
            <figcaption>
              {item === 'baseline' ? 'Current authored content' : 'Proposed correction'} · {data.name} · page {page}
            </figcaption>
            <div className="gf9-faction-frame-window">
              <iframe
                title={`${item} ${data.name} sheet page ${page}`}
                src={frameUrl(item)}
                width="793.7008"
                height="1122.5197"
              />
            </div>
          </figure>
        ))}
      </div>
      {faction === 'ecaz' && (
        <p>
          The proposed wording collects the existing Vidal revival rules in one advantage. It makes Ghola inclusion and
          the at-least-five threshold explicit. The cost, force supply and leader identities stay the same.
        </p>
      )}
      {faction === 'bene-gesserit' && (
        <p>
          The proposed connector keeps its natural text width. Fighter and Advisor remain two faces of the same twenty
          forces.
        </p>
      )}
    </section>
  );
}
