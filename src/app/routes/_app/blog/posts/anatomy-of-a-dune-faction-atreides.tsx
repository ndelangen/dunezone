import { Section } from '@ui/block/Section';

import { Lead, Paragraph, PostLink } from '../postContent';
import { FactionExtras } from './anatomy/FactionExtras';
import { FactionRecipe } from './anatomy/FactionRecipe';
import { FiveYears } from './anatomy/FiveYears';
import { SavedCheck } from './anatomy/SavedCheck';
import { TableSpread } from './anatomy/TableSpread';

export default function Post() {
  return (
    <>
      <Lead>
        At the end of{' '}
        <PostLink to="/blog/$postSlug" params={{ postSlug: 'all-in-one-dune-board-game-webapp' }}>
          my earlier attempts
        </PostLink>{' '}
        I promised to show where the data lives now, and how it all fits together. So here is House Atreides, taken
        apart, and how it turns into every card, token and sheet on dune.zone.
      </Lead>
      <Section title="The ingredients">
        <Paragraph>
          Open{' '}
          <PostLink to="/factions/$factionId" params={{ factionId: 'house-atreides' }}>
            House Atreides
          </PostLink>{' '}
          on dune.zone and you see a finished faction. Underneath, it is a short list of things someone typed in or
          picked from a library.
        </Paragraph>
        <Paragraph>
          There is the name, which also becomes the page&rsquo;s web address. There is a logo, a background texture with
          two colours laid over it, and a theme colour. Paul is the faction leader, and five more leaders each bring a
          portrait and a strength. The troops have their own icon and a count of twenty.
        </Paragraph>
        <Paragraph>
          Then there are the rules: ten troops in Arrakeen and ten in reserve at the start, two free revivals, ten
          spice, six advantages, five of them with a Karama effect, the alliance ability and the fate card.
        </Paragraph>
      </Section>
      <Section title="Everything is drawn from it">
        <Paragraph>
          None of the pieces you see on the site are stored as pictures. The faction sheet, the leader tokens, the
          traitor cards, the troop token, the faction token, the alliance card and the shield are all drawn from those
          ingredients, right in your browser. Change the logo once and every piece follows.
        </Paragraph>
        <Paragraph>
          When a printable PDF or an image file is needed, a cloud worker opens the same pages in a browser of its own
          and saves what it draws, so the files always match the site. Pick an ingredient in the figure to see where it
          ends up, or pick a piece to see what it is made of.
        </Paragraph>
        <FactionRecipe />
        <Paragraph>
          The complexity rating on the faction page is worked out from the faction&rsquo;s own rules, though the author
          can still override it.
        </Paragraph>
      </Section>
      <Section title="Adding your own cards and tokens">
        <Paragraph>
          Not everything a faction brings can be drawn from its ingredients. Some factions come with a deck of their
          own, or a handful of special tokens. Those are made as assets of their own, and the faction links to them.
          When a game is set up, they come along with the faction.
        </Paragraph>
        <FactionExtras />
      </Section>
      <Section title="It took five years to get this shape">
        <Paragraph>
          There were four projects along the way. Their stories are in{' '}
          <PostLink to="/blog/$postSlug" params={{ postSlug: 'all-in-one-dune-board-game-webapp' }}>
            the earlier post
          </PostLink>
          , so here is just how each one stored a faction.
        </Paragraph>
        <Paragraph>
          In 2021, dune.games stored game results, and a faction was a name on one. In 2023, dune-app had a real
          faction, but every card and token kept its own copy of the data. In 2024, dune-assets turned it around: the
          pictures came first, and each one carried its own logo, colours and background, so changing a logo meant
          changing it in every picture. Today there is one faction, and every piece is drawn from it.
        </Paragraph>
        <FiveYears />
      </Section>
      <Section title="Where it lives now">
        <Paragraph>
          The whole faction lives in one document in a factions table, with everything above inside it. Before anything
          is saved, the server checks it against one set of rules, the same rules the faction editor uses while you
          work.
        </Paragraph>
        <SavedCheck />
        <Paragraph>
          For 17 days in March 2026 that table lived on Supabase. Then it moved to Convex, where the data and the server
          code live side by side, and a page updates by itself when the data behind it changes.
        </Paragraph>
        <Paragraph>
          Some of those rules are older than the site. The ones for decals and for rule text are the 2024 versions from
          dune-assets, almost unchanged.
        </Paragraph>
      </Section>
      <Section title="Why the shape matters for homebrew">
        <Paragraph>
          Because a faction is one thing, whoever makes a homebrew faction gets the whole set with it: every card, token
          and sheet, ready for the table, for print and play, and for the rulebook.
        </Paragraph>
        <Paragraph>
          Here is{' '}
          <PostLink to="/factions/$factionId" params={{ factionId: 'smugglers' }}>
            Smugglers
          </PostLink>
          , a faction by Argelius, drawn the same way as Atreides. If you have a faction of your own in mind,{' '}
          <PostLink to="/factions/create">the faction creator</PostLink> is where it starts.
        </Paragraph>
        <TableSpread />
      </Section>
    </>
  );
}
