import type { RulebookBlockKind, rulebookLayoutCatalogue, RulebookPageLayoutId } from '@shared/rulebooks/contents';
import {
  AlignLeft,
  BookImage,
  BookOpenText,
  Columns2,
  createLucideIcon,
  ContactRound,
  FileImage,
  GalleryHorizontalEnd,
  Heading,
  IdCard,
  Image,
  Images,
  LayoutGrid,
  LayoutPanelTop,
  Lightbulb,
  List,
  ListChecks,
  ListOrdered,
  ListTree,
  MessageSquareQuote,
  MessagesSquare,
  Newspaper,
  Palette,
  PanelBottom,
  PanelBottomDashed,
  PanelLeft,
  PanelLeftDashed,
  PanelRight,
  PanelRightDashed,
  PanelsTopLeft,
  PanelTopDashed,
  RectangleVertical,
  ScanEye,
  SquareDashed,
  SquareStar,
  StickyNote,
  Table,
  Tag,
  TextSearch,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type RulebookEditorIconArrangement = Readonly<{
  widePosition?: 'left' | 'right';
  bandPosition?: 'top' | 'bottom';
  outerRailSide?: 'left' | 'right';
}>;

export type RulebookEditorRegionKey = (typeof rulebookLayoutCatalogue)[number]['regions'][number]['key'];

const OuterRail = createLucideIcon('OuterRail', [
  ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2', key: 'page' }],
  ['path', { d: 'M7 3v18M14 3v18', key: 'columns' }],
]);

const layoutIcons = {
  'chapter-opener': BookOpenText,
  'rules-page': Newspaper,
  'visual-reference': PanelsTopLeft,
  'single-column': RectangleVertical,
  'two-columns': Columns2,
  'wide-narrow': PanelRight,
  'outer-rail': OuterRail,
  'band-columns': LayoutPanelTop,
  cover: BookImage,
} satisfies Record<RulebookPageLayoutId, LucideIcon>;

const blockIcons = {
  'section-heading': Heading,
  text: AlignLeft,
  list: List,
  callout: MessageSquareQuote,
  'question-answer': MessagesSquare,
  'referenced-illustration': Image,
  'illustrated-inventory': LayoutGrid,
  'faction-introduction': ContactRound,
  'card-entry': IdCard,
  'card-group': GalleryHorizontalEnd,
  'asset-explainer': ScanEye,
  'reference-table': Table,
  credits: Users,
  'repeated-text': ListOrdered,
  'rule-group': ListTree,
  'asset-figure': FileImage,
} satisfies Record<RulebookBlockKind, LucideIcon>;

const regionIcons = {
  feature: SquareStar,
  rules: ListChecks,
  examples: Lightbulb,
  figures: Images,
  notes: StickyNote,
  content: SquareDashed,
  column1: PanelLeftDashed,
  column2: PanelRightDashed,
  wide: PanelLeftDashed,
  narrow: PanelRightDashed,
  rail: PanelLeftDashed,
  band: PanelTopDashed,
  cover: Palette,
  footer: PanelBottom,
  'chapter-label': Tag,
  guidance: TextSearch,
} satisfies Record<RulebookEditorRegionKey, LucideIcon>;

/** The page icon follows the fixed arrangement chosen when the author created it. */
export function rulebookLayoutIcon(
  layoutId: RulebookPageLayoutId,
  arrangement: RulebookEditorIconArrangement = {}
): ReactNode {
  const Icon = layoutId === 'wide-narrow' && arrangement.widePosition === 'right' ? PanelLeft : layoutIcons[layoutId];
  const flippedBand = layoutId === 'band-columns' && arrangement.bandPosition === 'bottom';
  const mirroredRail = layoutId === 'outer-rail' && arrangement.outerRailSide === 'right';
  return (
    <Icon
      aria-hidden
      style={flippedBand ? { transform: 'rotate(180deg)' } : mirroredRail ? { transform: 'scaleX(-1)' } : undefined}
    />
  );
}

/** Navigation, summaries, drag previews and add menus share each Block's glyph. */
export function rulebookBlockIcon(kind: RulebookBlockKind): ReactNode {
  const Icon = blockIcons[kind];
  return <Icon aria-hidden />;
}

/** Region boundaries stay distinct from the content glyphs inside them. */
export function rulebookRegionIcon(
  regionKey: RulebookEditorRegionKey,
  arrangement: RulebookEditorIconArrangement = {}
): ReactNode {
  const icons = {
    ...regionIcons,
    wide: arrangement.widePosition === 'right' ? PanelRightDashed : PanelLeftDashed,
    narrow: arrangement.widePosition === 'right' ? PanelLeftDashed : PanelRightDashed,
    band: arrangement.bandPosition === 'bottom' ? PanelBottomDashed : PanelTopDashed,
    rail: arrangement.outerRailSide === 'right' ? PanelRightDashed : PanelLeftDashed,
  };
  const Icon = icons[regionKey];
  return <Icon aria-hidden />;
}
