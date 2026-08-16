import { Anchor } from '@mantine/core';
import preview from '@sb/preview';
import { ArrowRight, BookOpen, Gamepad2, ListChecks, Printer, Search, Trophy } from 'lucide-react';

import { Bullets } from './Bullets';

const meta = preview.meta({
  component: Bullets,
  parameters: { layout: 'padded' },
  args: {
    children: (
      <>
        <Bullets.Item icon={<BookOpen size={20} />} title="Web-native rulebooks" />
        <Bullets.Item icon={<Printer size={20} />} title="PDF and TTS output" />
        <Bullets.Item icon={<Trophy size={20} />} title="Results and leaderboards" />
      </>
    ),
  },
});

/** A plain list: one line per item, medallion centred on the title. */
export const Default = meta.story({});

/** With detail lines. The extra line switches each row to top alignment. */
export const WithDetail = meta.story({
  args: {
    children: (
      <>
        <Bullets.Item
          icon={<BookOpen size={20} />}
          title="Faithful editions"
          detail="Preserve the books people know."
        />
        <Bullets.Item
          icon={<Search size={20} />}
          title="Find an answer"
          detail="Search rules without stopping the game."
        />
        <Bullets.Item
          icon={<ListChecks size={20} />}
          title="Compare editions"
          detail="See which rule belongs to which game."
        />
      </>
    ),
  },
});

/** Three columns, for a row of capabilities beneath a heading. */
export const InColumns = meta.story({
  args: {
    gap: 'xl',
    columns: { base: 1, sm: 3 },
    children: (
      <>
        <Bullets.Item
          icon={<Printer size={20} />}
          title="Print and PDF"
          detail="Bring a finished edition to the table."
        />
        <Bullets.Item
          icon={<Gamepad2 size={20} />}
          title="Tabletop Simulator"
          detail="Export the same work for online play."
        />
        <Bullets.Item
          icon={<Trophy size={20} />}
          title="Leaderboards"
          detail="Celebrate who plays — and wins — the most."
        />
      </>
    ),
  },
});

/** A navigating list: every item is a link, so the items carry the spacing and the rules. */
export const AsNavigation = meta.story({
  args: {
    gap: 'none',
    children: (
      <>
        {['Read the rules', 'Create and publish', 'Record the game'].map((label) => (
          <Bullets.Item
            key={label}
            icon={<BookOpen size={20} />}
            title={label}
            trailing={<ArrowRight size={16} aria-hidden />}
            renderLink={(content) => (
              <Anchor href="#" onClick={(event) => event.preventDefault()} c="inherit" underline="never">
                {content}
              </Anchor>
            )}
          />
        ))}
      </>
    ),
  },
});

/** The medallion holds its size while a long title wraps beside it. */
export const LongTitleWraps = meta.story({
  args: {
    children: (
      <Bullets.Item
        icon={<BookOpen size={20} />}
        title="Every published rulebook, rebuilt for the web and searchable at the table"
        trailing={<ArrowRight size={16} aria-hidden />}
      />
    ),
  },
  globals: { viewport: { value: 'contentNarrow' } },
});
