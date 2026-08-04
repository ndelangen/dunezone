/* oxlint-disable jsx-a11y/alt-text -- Decorative game-rulebook layers. */

import { Token } from '../../assets/faction/token/Token';
import * as colors from '../../assets/utils/colors';
import { Definitions } from '../../components/block/Definitions';
import { FactionSynopsis } from '../../components/block/FactionSynopsis';
import { Spaced } from '../../components/block/Spaced';
import { Text } from '../../components/block/Text';
import { Title } from '../../components/block/Title';
import { Wrapper } from '../../components/block/Wrapper';
import { factionTokenFixtures } from '../../fixtures/factionTokens';

const baseFactionTokens = [
  factionTokenFixtures.emperor,
  factionTokenFixtures.guild,
  factionTokenFixtures.fremen,
  factionTokenFixtures.ixian,
  factionTokenFixtures.atreides,
  factionTokenFixtures.beneGesserit,
  factionTokenFixtures.beneTleilaxu,
  factionTokenFixtures.harkonnen,
];

const expansionFactionTokens = [
  factionTokenFixtures.ginaz,
  factionTokenFixtures.choam,
  factionTokenFixtures.ecaz,
  factionTokenFixtures.iduali,
  factionTokenFixtures.richese,
  factionTokenFixtures.landsraad,
  factionTokenFixtures.moritani,
];

export function Factions1() {
  return (
    <Spaced>
      <Title color={colors.blue1}>Factions</Title>
      <Text>
        <p>Each set is composed of the following:</p>
        <Definitions>
          <dt>A Faction token</dt>
          <dd>
            <p>
              This token is placed on the storm track around the board, to indicate where this
              player is seated.
            </p>
            <p>
              On the backside of the token is a "pass"-icon, indicating this faction is no longer
              able/willing take actions this phase.
            </p>
          </dd>
          <dt>A Faction Sheet</dt>
          <dd>
            <p>Describing each Faction's Advantages.</p>
            <p>Reference for their troops & leader strengths.</p>
            <p>Reference for their karama effects & FAQ.</p>
          </dd>
          <dt>Leader discs</dt>
          <dd>
            <p>Each disc shows a leader and their fighting strength.</p>
          </dd>
          <dt>Leader traitor cards</dt>
          <dd>
            <p>Every leader disc should have a traitor card representing the leader disc.</p>
          </dd>
          <dt>Troop tokens</dt>
          <dd>
            <p>A total of 20 tokens.</p>
            <p>Troops tokens can be multi-sided.</p>
            <p>Some factions have multiple types of Troop tokens.</p>
          </dd>
          <dt>Starting Spice</dt>
          <dd>
            <p>This should match the starting Spice specified on the faction sheet.</p>
          </dd>
          <dt>Faction specific items</dt>
          <dd>
            <p>
              Some factions will have unique items, such as a Kwisatz Haderach token for house
              Atreides.
            </p>
          </dd>
        </Definitions>
        <p>All block of each player set have the same color for easy identification.</p>
      </Text>
      <div style={{ display: 'flex', gap: '0.5vw' }}>
        {baseFactionTokens.map((token) => (
          <Wrapper key={token.logo} size={{ width: 1200, height: 1200 }}>
            <Token {...token} />
          </Wrapper>
        ))}
      </div>

      <Text>
        <p>And the following factions are available in the expansion:</p>
      </Text>

      <div style={{ display: 'flex', gap: '2vw' }}>
        {expansionFactionTokens.map((token) => (
          <Wrapper key={token.logo} size={{ width: 1200, height: 1200 }}>
            <Token {...token} />
          </Wrapper>
        ))}
      </div>
    </Spaced>
  );
}

export function Factions2() {
  return (
    <Spaced>
      <Title color={colors.blue1} size="medium">
        Factions in the game
      </Title>
      <Text>
        <p>You will play as one of these factions:</p>
      </Text>
      <FactionSynopsis token={factionTokenFixtures.emperor}>
        <h1>Emperor</h1>
        <p>
          his majesty the Padishah Emperor Shaddam IV of house Corrino — keen and efficient, yet
          easily lulled into complacency by his own trappings of power.
        </p>
      </FactionSynopsis>
      <FactionSynopsis token={factionTokenFixtures.guild}>
        <h1>Spacing Guild</h1>
        <p>
          represented by steersman Edric (in league with smuggler bands) — monopolist of transport,
          yet addicted to ever increasing spice flows.
        </p>
      </FactionSynopsis>
      <FactionSynopsis token={factionTokenFixtures.fremen}>
        <h1>Fremen</h1>
        <p>
          represented by the planetary ecologist Liet Kynes — commanding fierce hordes of natives,
          adept at life and travel on the planet, and dedicated to preventing any outside control
          while bringing about Dune’s own natural regeneration.
        </p>
      </FactionSynopsis>
      <FactionSynopsis token={factionTokenFixtures.ixian}>
        <h1>Ixian</h1>
        <p>
          led by the human cyborg Prince Rhombur Vernius possessing courage. They are technocrats
          who specialize in production and supply chains. On Arrakis they have a movable stronghold,
          which is hidden from space.
        </p>
      </FactionSynopsis>
      <FactionSynopsis token={factionTokenFixtures.atreides}>
        <h1>House Atreides</h1>
        <p>
          led by the youthful Paul Atreides (Muad'dib) — rightful heir to the planet, gifted with
          valiant lieutenants and a strange partial awareness of the future, but beset by more
          powerful and treacherous opponents.
        </p>
      </FactionSynopsis>
    </Spaced>
  );
}

export function Factions3() {
  return (
    <Spaced>
      <Text>Continued list of factions.</Text>
      <FactionSynopsis flip token={factionTokenFixtures.beneGesserit}>
        <h1>Bene Gesserit</h1>
        <p>
          represented by Reverend Mother Gaius Helen Mohiam — ancient and inscrutable, carefully
          trained in psychological control and a genius at achieving her ends through the efforts of
          others.
        </p>
      </FactionSynopsis>
      <FactionSynopsis flip token={factionTokenFixtures.beneTleilaxu}>
        <h1>Bene Tleilaxu</h1>
        <p>
          led by their Masters Council. They control the Axlotl tanks, and infiltrate other factions
          with deadly Face Dancers. Although loathed by other factions, they are tolerated because
          of the miracles they are able to produce.
        </p>
      </FactionSynopsis>
      <FactionSynopsis flip token={factionTokenFixtures.harkonnen}>
        <h1>House Harkonnen</h1>
        <p>led by the decadent Baron Vladimir Harkonnen — master of treachery and cruel deeds.</p>
      </FactionSynopsis>
      <Text>
        <em>There's room for more factions!</em>
      </Text>
    </Spaced>
  );
}
