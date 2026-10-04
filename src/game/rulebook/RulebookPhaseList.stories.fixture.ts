import { TABLE_PHASES } from '@shared/play/phases';
import type { RulebookPageDraft } from '@shared/rulebooks/contents';
import { projectRulebookDraftRenderPage } from '@shared/rulebooks/projectRenderDocument';

const phaseNames: Record<(typeof TABLE_PHASES)[number]['id'], string> = {
  storm: 'Storm',
  'spice-blow': 'Spice Blow',
  'choam-charity': 'CHOAM Charity',
  bidding: 'Bidding',
  revival: 'Revival',
  'shipment-and-movement': 'Shipment and Movement',
  battle: 'Battle',
  'spice-collection': 'Spice Collection',
  'mentat-pause': 'Mentat',
};
const entries: Array<{
  id: string;
  name: string;
  icon: (typeof TABLE_PHASES)[number]['symbol'] | '/vector/icon/alliance.svg';
  text: string;
}> = TABLE_PHASES.map((phase) => ({ id: phase.id, name: phaseNames[phase.id], icon: phase.symbol, text: '' }));
entries.splice(1, 0, { id: 'nexus', name: 'Nexus check', icon: '/vector/icon/alliance.svg', text: '' });

export function createPhaseListPage() {
  const page: RulebookPageDraft = {
    anchor: 'turn-and-nexus',
    blockOrderByRegion: {
      column1: ['PHAS', 'SEQN'],
      column2: ['NXDK', 'NXEX'],
    },
    blocksById: {
      NXDK: {
        id: 'NXDK',
        kind: 'text',
        name: 'Check for a Nexus',
        text: 'The Nexus deck contains ten cards: one each numbered 1 through 7, plus three blanks.\n\nAfter Storm each turn, reveal the top card. If its number is lower than the current turn number, a Nexus occurs. A number equal to or higher than the turn number does not cause a Nexus. A blank does nothing.\n\nReturn the drawn card to the deck and reshuffle after every check, whether or not a Nexus occurs.\n\nA Nexus lets players form or break alliances. Shai-Hulud appearances do not trigger a Nexus; use this deck procedure. Atreides may look at the top card through Nexus Prescience.',
      },
      NXEX: {
        id: 'NXEX',
        kind: 'callout',
        variant: 'example',
        title: 'Example: turn three',
        text: 'Drawing 1 or 2 causes a Nexus. Drawing 3 does not, because the number must be lower than the turn number. Neither a higher number nor a blank causes one.\n\nThe chance is 20% on turn three. No numbered card qualifies on turn one. From turn eight onward, all seven numbered cards qualify, for a 70% chance each turn.',
      },
      PHAS: {
        id: 'PHAS',
        kind: 'text',
        name: 'Turn order',
        text: 'Each turn follows this sequence. The faction chapters explain abilities used within each phase.',
      },
    },
    controlValues: {},
    id: 'TURN',
    layoutId: 'two-columns',
    showHeading: true,
    title: 'A turn and the Nexus',
  };
  page.blocksById.SEQN = {
    id: 'SEQN',
    kind: 'list',
    style: 'numbered',
    itemOrder: entries.map(({ id }) => id),
    itemsById: Object.fromEntries(entries.map((entry) => [entry.id, entry])),
  };
  return projectRulebookDraftRenderPage(page, {});
}
