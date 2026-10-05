import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';
import type { RulebookResolvedSource } from '@shared/rulebooks/sources';
import { rulebookSourceClipPath } from '@shared/rulebooks/sources';
/* Three throwaway chapter layouts compare how a first-time reader learns battle.
 * This fixture stays on the prototype branch until product review chooses an approach.
 */
import type { ComponentProps, CSSProperties, ReactNode } from 'react';

import { TroopToken } from '../assets/faction/troop/Troop';
import { BattleWheel } from '../assets/generic/BattleWheel';
import styles from './CombatPrototype.module.css';
import data from './CombatPrototype.stories.fixture.json';
import { atreidesSide, harkonnenSide } from './RulebookBattlePlan.stories.fixture';
import { RulebookBoardSceneVisual } from './RulebookBoardScene';
import { RulebookInteriorHeading } from './RulebookInteriorHeading';

export type CombatVariant = 'comic' | 'lesson' | 'table';
type Scene = 'hidden' | 'prescience' | 'dial' | 'reveal' | 'weapons' | 'total' | 'spite' | 'cards' | 'losses';
const a = atreidesSide;
const h = harkonnenSide;
const scenes: Record<Scene, { n: number; lead: string; rule: string; example: string; legend?: string }> = {
  hidden: {
    n: 2,
    lead: 'Prepare a battle plan.',
    rule: 'Choose in secret: an available leader or Cheap Hero, up to one weapon and one defense. Card slots may be empty. With no leader or Cheap Hero, announce it: you still fight, but cannot play Treachery Cards.',
    example:
      'Atreides has six troops in Hagga Basin; Harkonnen has five. The plans remain hidden until both players have finished.',
    legend: 'A leader already used in another territory this phase is unavailable. A Cheap Hero has 0 strength.',
  },
  prescience: {
    n: 3,
    lead: 'Resolve pre-reveal advantages.',
    rule: 'Before revealing, resolve applicable faction advantages in their stated order. Each may require a condition. For example, The Voice precedes Battle Prescience.',
    example:
      'Atreides uses Battle Prescience: "Which weapon will you play?" Harkonnen answers "Gom Jabbar." The answer is binding. Its other card stays face down.',
    legend:
      'This is one example of a pre-reveal advantage. Blackmail, Stone Burner, Fanatical Tactics and Infiltration can also affect this part of battle.',
  },
  dial: {
    n: 4,
    lead: 'Dial troop strength and set aside support spice.',
    rule: 'An ordinary troop gives ½ strength unsupported, or 1 strength with 1 spice of support. Choose a combination your troops and spice can supply. Dial that strength. For a half point, align the mark between whole numbers with the window.',
    example:
      'A possible commitment: two supported troops give 2 strength; two unsupported troops give 1. Together they supply a dial of 3 for 2 spice. Two other troops contribute nothing.',
    legend:
      'The dial is troop strength, not a count of troop tokens. The leader is added later. Keep both plans hidden until the reveal.',
  },
  reveal: {
    n: 5,
    lead: 'Reveal both final plans together.',
    rule: 'Finish all abilities that happen before the reveal. Once both plans are final, reveal them together. Resolve traitor calls first. A successful traitor call replaces the ordinary battle result.',
    example:
      'Neither player calls a traitor here. Atreides reveals Gurney, a Maula Pistol, a Snooper, dial 3 and 2 spice. Harkonnen reveals Feyd, Gom Jabbar, a Snooper, dial 4 and 4 spice.',
    legend: 'Left: Atreides, the aggressor. Right: Harkonnen, the defender. Both plans are now public.',
  },
  weapons: {
    n: 6,
    lead: 'Check each weapon against the opposing defense.',
    rule: 'An unblocked weapon kills the opposing leader. Resolve both attacks: winning the battle does not itself keep your leader alive, and losing your leader does not itself lose the battle.',
    example:
      "Snooper stops poison, so Gurney survives Gom Jabbar. Harkonnen's Snooper cannot stop the projectile Maula Pistol. Feyd dies.",
    legend: '❌ Killed leader: contributes 0 strength. Troop strength still counts.',
  },
  total: {
    n: 7,
    lead: 'Add the surviving leader and determine the winner.',
    rule: "Add the dialed troop strength, the surviving leader's strength and any permitted bonuses. The higher total wins. The aggressor normally wins a tie; Mercenaries can change that.",
    example: "Atreides: 3 + Gurney's 4 = 7. Harkonnen: 4 + 0 for Feyd = 4. Atreides wins, 7 to 4.",
    legend: 'Determine the result before settling cards, payments and troop losses.',
  },
  spite: {
    n: 8,
    lead: 'Resolve applicable post-reveal advantages.',
    rule: "Factions also have advantages after the reveal or result. Check each ability's precise window and conditions before moving on. They are not a universal extra action for every faction.",
    example:
      "Here Feyd was killed, so Harkonnen uses Vladimir's Spite. It exchanges its Gom Jabbar for Atreides' Snooper after the winner is established, before cards are kept or discarded.",
    legend:
      "Spite is one conditional example. The exchange does not rewrite either plan, undo Gurney's defense or change the 7 to 4 result.",
  },
  cards: {
    n: 9,
    lead: 'Settle the cards and leader reward.',
    rule: "The ordinary winner may keep or discard its played cards; the loser discards its played cards. The winner collects spice equal to the killed opposing leader's strength.",
    example:
      'Atreides takes 6 spice for Feyd and keeps its Maula Pistol and the Gom Jabbar received through Spite. Harkonnen discards both Snoopers.',
    legend:
      'The card received through Spite cannot be discarded immediately. Gurney remains committed to Hagga Basin this phase, even if later killed and revived.',
  },
  losses: {
    n: 10,
    lead: 'Pay support and remove troops last.',
    rule: 'Both sides pay their committed support spice. The winner loses troops that match both its dial and support payment. The loser loses every troop in the territory, including troops it did not commit.',
    example:
      'Atreides pays 2 spice and loses four troops: two supported and two unsupported match dial 3. Two troops remain. Harkonnen pays 4 spice and loses all five troops.',
    legend:
      'Resolve any Harkonnen leader capture after losses. The aggressor then chooses its next battle. A surviving leader may fight again in the same territory.',
  },
};

function Piece({ source, killed = false }: { source: RulebookResolvedSource; killed?: boolean }) {
  return (
    <span className={styles.piece}>
      {source.status === 'ready' && (
        <img src={source.imageUrl} alt={source.name} style={{ clipPath: rulebookSourceClipPath(source) }} />
      )}
      {killed && (
        <span className={styles.cross} role="img" aria-label="Killed">
          ❌
        </span>
      )}
    </span>
  );
}
function Card({ source }: { source?: RulebookResolvedSource }) {
  return (
    <span className={styles.card}>
      {source ? <Piece source={source} /> : <img src="/homepage-table/cardback.webp" alt="Face-down Treachery Card" />}
    </span>
  );
}
function Wheel({
  right = false,
  revealed = false,
  known = false,
  killed = false,
}: {
  right?: boolean;
  revealed?: boolean;
  known?: boolean;
  killed?: boolean;
}) {
  const side = right ? h : a;
  return (
    <div className={styles.wheelFrame}>
      <div className={styles.wheelCanvas} data-facing={right ? 'right' : 'left'}>
        {!revealed && (
          <div className={styles.hiddenCards}>
            <Card source={right && known ? h.plan.cards[0] : undefined} />
            <Card />
          </div>
        )}
        {revealed ? (
          <BattleWheel
            state="revealed"
            motion={false}
            label={`${side.name} revealed battle plan`}
            background={side.artwork.background}
            strength={side.plan.strength}
            spice={side.plan.spice}
            adjustment={0}
            troops={side.plan.troops}
            cards={side.plan.cards.map((s, i) => (
              <Card key={i} source={s} />
            ))}
            leader={<Piece source={side.plan.leader} killed={killed} />}
          />
        ) : (
          <div className={styles.hiddenWheel}>
            <BattleWheel
              state="unrevealed"
              artwork={side.artwork}
              motion={false}
              ready={false}
              label={`${side.name} hidden battle plan`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
function Plans({ scene }: { scene: Scene }) {
  return (
    <div className={styles.pair} aria-label="Atreides at left, Harkonnen at right">
      <Wheel revealed={['reveal', 'weapons', 'total'].includes(scene)} />
      <Wheel
        right
        revealed={['reveal', 'weapons', 'total'].includes(scene)}
        known={scene === 'prescience'}
        killed={scene === 'weapons' || scene === 'total'}
      />
    </div>
  );
}
function Troops({ count, right = false, dead = false }: { count: number; right?: boolean; dead?: boolean }) {
  return (
    <span className={styles.troops} data-lost={dead || undefined}>
      {Array.from({ length: count }, (_, i) => (
        <span className={styles.troop} key={i}>
          <TroopToken {...(right ? h : a).plan.troops[0].artwork} />
        </span>
      ))}
    </span>
  );
}
function Calculation() {
  return (
    <div className={styles.calculation}>
      <div>
        <Troops count={2} />
        <strong>2 × 1 = 2</strong>
        <span>2 spice</span>
      </div>
      <b>+</b>
      <div>
        <Troops count={2} />
        <strong>2 × ½ = 1</strong>
        <span>0 spice</span>
      </div>
      <b>=</b>
      <div>
        <strong className={styles.dialNumber}>3</strong>
        <span>Dial</span>
      </div>
    </div>
  );
}
function Movement({ scene }: { scene: Scene }) {
  if (scene === 'losses') {
    return (
      <div className={styles.losses}>
        <div>
          <Troops count={4} dead />
          <span>→ Tanks</span>
          <Troops count={2} />
          <span>stay</span>
        </div>
        <div>
          <Troops count={5} right dead />
          <span>→ Tanks</span>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.exchange}>
      <div className={styles.cardSet}>
        {(scene === 'spite' ? [a.plan.cards[1]] : [a.plan.cards[0], h.plan.cards[0]]).map((s, i) => (
          <Card key={i} source={s} />
        ))}
      </div>
      <span className={styles.arrow}>{scene === 'spite' ? '⇄' : '│'}</span>
      <div className={styles.cardSet}>
        {(scene === 'spite' ? [h.plan.cards[0]] : [h.plan.cards[1], a.plan.cards[1]]).map((s, i) => (
          <Card key={i} source={s} />
        ))}
      </div>
    </div>
  );
}
function Visual({ scene }: { scene: Scene }) {
  if (scene === 'dial') {
    return <Calculation />;
  }
  if (['spite', 'cards', 'losses'].includes(scene)) {
    return <Movement scene={scene} />;
  }
  return <Plans scene={scene} />;
}
function Copy({ scene, compact = false }: { scene: Scene; compact?: boolean }) {
  const s = scenes[scene];
  return (
    <div className={styles.copy} data-compact={compact || undefined}>
      <p>
        <span className={styles.number}>{s.n}</span> <strong>{s.lead}</strong> {s.rule}
      </p>
      <p className={styles.example}>{s.example}</p>
      {s.legend && <p className={styles.legend}>{s.legend}</p>}
    </div>
  );
}
function Step({ scene }: { scene: Scene }) {
  return (
    <section className={styles.step}>
      <Visual scene={scene} />
      <Copy scene={scene} />
    </section>
  );
}
function Page({ title, number, children }: { title: string; number: number; children: ReactNode }) {
  return (
    <article
      className={styles.page}
      style={{ '--rulebook-mm': 'calc(100cqw / 230)' } as CSSProperties}
      aria-label={`Page ${number}: ${title}`}
    >
      <RulebookInteriorHeading title={title} icon="/vector/icon/combat.svg" />
      <div className={styles.body}>{children}</div>
      <footer className={styles.footer}>
        <span>DREAM RULEBOOK · BATTLE</span>
        <span>{number}</span>
      </footer>
    </article>
  );
}
const board = data.board as Extract<RulebookRenderBlockV1, { kind: 'board-scene' }>;
function MapLesson() {
  return (
    <div className={styles.mapFull}>
      <p className={styles.intro}>
        <span className={styles.number}>1</span> <strong>Find the aggressor and choose a battle.</strong> Opposing
        troops in one territory must battle. Allies and Bene Gesserit advisors do not fight; there are no battles in the
        Polar Sink. Storm does not prevent battle.
      </p>
      <RulebookBoardSceneVisual scene={board} />
      <p className={styles.legend}>
        With several opponents in one territory, choose one, resolve that battle, then choose the next. Complete each
        battle before starting another.
      </p>
    </div>
  );
}
function TimingIntro() {
  return (
    <p className={styles.intro}>
      Resolve Supplies and the last opportunity for the Ixian alliance card exchange before building plans. The example
      follows Atreides and Harkonnen; your faction may introduce different abilities at the same stages.
    </p>
  );
}
function Ties() {
  return (
    <div className={styles.ties}>
      <section>
        <div className={styles.score}>
          <span>7</span>
          <b>=</b>
          <span>7</span>
        </div>
        <p>
          <strong>Ordinary tie.</strong> Atreides is the aggressor, so Atreides wins.
        </p>
        <p>The total already includes troop strength, the surviving leader and any bonuses.</p>
      </section>
      <section>
        <div className={styles.score}>
          <span>7</span>
          <b>=</b>
          <span>6 + 1</span>
        </div>
        <p>
          <strong>Mercenaries changes the tie.</strong> Harkonnen adds 1 strength with Mercenaries, reaches 7 and wins
          the tie.
        </p>
        <p>One Mercenaries card may join the plan without using the weapon, defense or leader slot.</p>
      </section>
    </div>
  );
}
function TroopLabel({ name }: { name: keyof typeof data.troopTypes }) {
  return (
    <span className={styles.troopLabel}>
      <span className={styles.troop}>
        <TroopToken {...(data.troopTypes[name] as ComponentProps<typeof TroopToken>)} />
      </span>
      {name}
    </span>
  );
}
function Specials() {
  return (
    <>
      <p className={styles.intro}>
        The battle sequence stays the same. Some troop types change how much strength a token supplies, how support
        works, or which troops you lose.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Troop</th>
            <th>Unsupported</th>
            <th>With 1 spice</th>
            <th>Apply this exception</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Ordinary</td>
            <td>½</td>
            <td>1</td>
            <td>The starting rule.</td>
          </tr>
          <tr>
            <td>
              <TroopLabel name="Sardaukar" />
            </td>
            <td>1</td>
            <td>2</td>
            <td>Counts as ordinary against Fremen.</td>
          </tr>
          <tr>
            <td>
              <TroopLabel name="Fedaykin" />
            </td>
            <td>2</td>
            <td>No payment</td>
            <td>Free Spice Dialing; ordinary Fremen supply 1.</td>
          </tr>
          <tr>
            <td>
              <TroopLabel name="Cyborg" />
            </td>
            <td>1</td>
            <td>2</td>
            <td>Immune to Karama.</td>
          </tr>
          <tr>
            <td>
              <TroopLabel name="Suboid" />
            </td>
            <td>½</td>
            <td>Cannot support</td>
            <td>May save a committed Cyborg after an Ixian victory.</td>
          </tr>
          <tr>
            <td>
              <TroopLabel name="Patched Cyborg" />
            </td>
            <td>2</td>
            <td>No payment</td>
            <td>Can survive its next winning commitment, then flips back.</td>
          </tr>
        </tbody>
      </table>
      <div className={styles.columns}>
        <section>
          <p>
            <strong>Match strength and spice, not token count.</strong> Two supported Sardaukar supply 4 strength for 2
            spice. After an ordinary victory, losing those two tokens satisfies the plan.
          </p>
          <p>
            For dial 3 and 1 spice, Emperor could instead lose one supported Sardaukar plus two unsupported ordinary
            troops, or one supported ordinary troop plus four unsupported ordinary troops.
          </p>
        </section>
        <section>
          <p>
            <strong>Ixian losses.</strong> After a win, an uncommitted Suboid may die in place of a committed Cyborg.
            Flip the saved Cyborg to its patched side. These abilities do not save troops after an ordinary defeat.
          </p>
          <p>
            <strong>Check suppressed abilities.</strong> Karama can suppress Fedaykin or Free Spice Dialing for the
            phase. Apply that change before calculating the plan.
          </p>
        </section>
      </div>
    </>
  );
}
function Exceptions() {
  return (
    <>
      <p className={styles.intro}>
        These results interrupt or replace parts of the ordinary battle. Check the condition first, then apply that
        result's costs and losses. The faction chapters give the complete advantages.
      </p>
      <div className={styles.exceptionGrid}>
        {data.special.BSPC.map((b) => (
          <section className={styles.exception} key={b.id}>
            <p>
              <strong>{b.name}.</strong>
            </p>
            {b.text.split('\n\n').map((t, i) => (
              <p key={i}>{t.replaceAll('Under v0.8, the', 'The').replaceAll('v0.8 treats', 'this result treats')}</p>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
function Timing() {
  return (
    <div className={styles.columns}>
      <section>
        <p>
          <strong>Before reveal.</strong> The Voice precedes Battle Prescience. Then come Blackmail and Stone Burner.
          During commitment, Fanatical Tactics and Infiltration may apply. Their conditions and ordering come from the
          faction rules.
        </p>
      </section>
      <section>
        <p>
          <strong>After reveal.</strong> Resolve traitor calls before an ordinary result. Some abilities replace the
          result; others act afterwards. Vladimir's Spite requires the Harkonnen leader to be killed and happens before
          card disposal. Leader capture follows losses.
        </p>
      </section>
    </div>
  );
}

export function CombatPrototype({ variant, page = 0 }: { variant: CombatVariant; page?: number }) {
  let pages: { title: string; body: ReactNode }[];
  if (variant === 'comic') {
    pages = [
      {
        title: 'Choose a battle',
        body: (
          <>
            <p className={styles.intro}>
              Choose → prepare → reveal → resolve → settle. Follow one battle through all five stages before starting
              another.
            </p>
            <MapLesson />
          </>
        ),
      },
      {
        title: 'Prepare your battle plan',
        body: (
          <>
            <TimingIntro />
            <div className={styles.preparation}>
              <section className={styles.step}>
                <Visual scene="prescience" />
                <div className={styles.preparationCopy}>
                  <Copy scene="hidden" />
                  <Copy scene="prescience" />
                </div>
              </section>
              <Step scene="dial" />
            </div>
          </>
        ),
      },
      {
        title: 'Reveal and resolve',
        body: (
          <div className={styles.rows}>
            <Step scene="reveal" />
            <Step scene="weapons" />
            <Step scene="total" />
          </div>
        ),
      },
      {
        title: 'Settle the battle',
        body: (
          <div className={styles.rows}>
            <Step scene="spite" />
            <Step scene="cards" />
            <Step scene="losses" />
          </div>
        ),
      },
      {
        title: 'How to resolve ties?',
        body: (
          <>
            <p className={styles.intro}>The example battle is over. These are two separate tie situations.</p>
            <Ties />
            <Timing />
          </>
        ),
      },
      { title: 'Special troops', body: <Specials /> },
      { title: 'Results that replace battle', body: <Exceptions /> },
    ];
  } else if (variant === 'lesson') {
    pages = [
      {
        title: 'Where battle begins',
        body: (
          <>
            <MapLesson />
            <p className={styles.ribbon}>One battle at a time: choose → prepare → reveal → resolve → settle.</p>
          </>
        ),
      },
      {
        title: 'Before either plan is revealed',
        body: (
          <>
            <TimingIntro />
            <div className={styles.hero}>
              <Plans scene="prescience" />
            </div>
            <div className={styles.columns}>
              <Copy scene="hidden" />
              <Copy scene="prescience" />
            </div>
          </>
        ),
      },
      {
        title: 'How to dial a battle',
        body: (
          <>
            <div className={styles.hero}>
              <Calculation />
            </div>
            <Copy scene="dial" />
            <p className={styles.ribbon}>2 supported + 2 unsupported = 3 strength for 2 spice.</p>
            <p className={styles.intro}>
              You may leave troops uncommitted. They add no strength, but an ordinary defeat still removes them. The
              leader's strength does not belong on the troop dial.
            </p>
          </>
        ),
      },
      {
        title: 'Reveal, then resolve',
        body: (
          <>
            <div className={styles.hero}>
              <Plans scene="weapons" />
            </div>
            <div className={styles.threeColumns}>
              <Copy scene="reveal" compact />
              <Copy scene="weapons" compact />
              <Copy scene="total" compact />
            </div>
          </>
        ),
      },
      {
        title: 'After the result',
        body: (
          <>
            <div className={styles.twoVisuals}>
              <Movement scene="spite" />
              <Movement scene="losses" />
            </div>
            <div className={styles.threeColumns}>
              <Copy scene="spite" compact />
              <Copy scene="cards" compact />
              <Copy scene="losses" compact />
            </div>
          </>
        ),
      },
      {
        title: 'How to resolve ties?',
        body: (
          <>
            <Ties />
            <Timing />
          </>
        ),
      },
      { title: 'Special troops', body: <Specials /> },
      { title: 'Results that replace battle', body: <Exceptions /> },
    ];
  } else {
    pages = [
      {
        title: 'Choose a battle',
        body: (
          <>
            <MapLesson />
            <p className={styles.ribbon}>
              Atreides chooses Hagga Basin first. Keep that battle on the table until it is fully settled.
            </p>
          </>
        ),
      },
      {
        title: 'Prepare, then reveal',
        body: (
          <>
            <TimingIntro />
            <div className={styles.tableStage}>
              <Plans scene="prescience" />
              <Calculation />
            </div>
            <div className={styles.threeColumns}>
              <Copy scene="hidden" compact />
              <Copy scene="prescience" compact />
              <Copy scene="dial" compact />
            </div>
          </>
        ),
      },
      {
        title: 'Read the revealed plans',
        body: (
          <>
            <div className={styles.tableStage}>
              <Plans scene="weapons" />
              <div className={styles.total}>
                <span>Atreides</span>
                <strong>3 + 4 = 7</strong>
                <span>Harkonnen</span>
                <strong>4 + 0 = 4</strong>
              </div>
            </div>
            <div className={styles.threeColumns}>
              <Copy scene="reveal" compact />
              <Copy scene="weapons" compact />
              <Copy scene="total" compact />
            </div>
          </>
        ),
      },
      {
        title: 'Clear the table in order',
        body: (
          <div className={styles.aftermathColumns}>
            {(['spite', 'cards', 'losses'] as Scene[]).map((scene) => (
              <section key={scene}>
                <Movement scene={scene} />
                <Copy scene={scene} compact />
              </section>
            ))}
          </div>
        ),
      },
      {
        title: 'How to resolve ties?',
        body: (
          <>
            <Ties />
            <Timing />
          </>
        ),
      },
      { title: 'Special troops', body: <Specials /> },
      { title: 'Results that replace battle', body: <Exceptions /> },
    ];
  }
  return (
    <div className={styles.book} data-combat-variant={variant}>
      {pages.map((p, i) =>
        page !== 0 && page !== i + 1 ? null : (
          <Page key={p.title} title={p.title} number={i + 1}>
            {p.body}
          </Page>
        )
      )}
    </div>
  );
}
