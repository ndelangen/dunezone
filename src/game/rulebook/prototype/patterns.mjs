/*
 * A facing-page study separates book design and size from page arrangements and editable blocks.
 * Short historical excerpts demonstrate patterns rather than complete or newly authored rules.
 */
import { specimens } from './specimens.mjs';

const $ = (id) => document.getElementById(id);
const escape = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const layouts = [
  ['single', 'Single column', 'One reading region for rules, lists and examples.', 'Expansion rules'],
  ['two', 'Two columns', 'Two reading regions under a shared heading.', 'Base FAQ, p. 22'],
  [
    'rail',
    'Outer rail',
    'Reading columns beside a rail for related emblems, figures or quotations. The rail changes sides across the spread.',
    'Base setup and faction sheets; compilation, p. 32',
  ],
  [
    'figure',
    'Figure + explanation',
    'A large figure beside its explanation. On tall pages, the figure sits above the text.',
    'Compilation components, pp. 10-11',
  ],
  [
    'band',
    'Wide band + columns',
    'A spanning region above or below two columns.',
    'Compilation introductions and references',
  ],
  [
    'panels',
    'Stacked panels',
    'Repeated full-width entries. A faction panel holds its emblem, introduction and leader group.',
    'Compilation factions, pp. 6-7; Ixian introductions, p. 3',
  ],
  [
    'cover',
    'Cover',
    'Artwork, title and edition details, with a treatment belonging to the book design.',
    'Base and expansion covers',
  ],
];
const blocks = [
  ['heading', 'Section heading', 'Title · section or faction association'],
  ['text', 'Text or named rule', 'Optional rule name · paragraphs'],
  ['list', 'List', 'Numbered or bulleted · items'],
  ['callout', 'Note, example or quotation', 'Kind · title · text · attribution'],
  ['figure', 'Figure', 'Image reference · caption · optional labels and key'],
  ['entries', 'Illustrated entries or inventory', 'Name · description · image reference · optional quantity'],
  ['faction', 'Faction introduction', 'Emblem · introduction · ruler · leader group'],
  ['qa', 'Question and answer', 'Question · answer · optional topic'],
  ['table', 'Reference table', 'Column labels · rows · note'],
  ['contents', 'Contents', 'Section names · page references'],
  ['credits', 'Credits', 'Groups · names · roles'],
];
const formats = { square: [794, 794, 'Square'], a4: [794, 1123, 'A4'], tall: [397, 1123, 'A4 folded lengthwise'] };
const designs = {
  illustrated: [
    'Illustrated classic',
    'Cream paper, coloured heading bands and gold callouts. The original worm and fighter artwork alternates across facing pages.',
  ],
  restrained: [
    'Restrained expansion',
    'The same content uses a quieter frame: cream paper, heading bands and a gold footer with alternating page numbers.',
  ],
};
const params = new URLSearchParams(location.search);
const state = {
  design: Object.hasOwn(designs, params.get('design')) ? params.get('design') : 'illustrated',
  format: Object.hasOwn(formats, params.get('format')) ? params.get('format') : 'square',
  layout: layouts.some(([id]) => id === params.get('layout')) ? params.get('layout') : 'rail',
};
const fremen = specimens[0].sections.flatMap((section) => section.items);
const rule = (index) =>
  `<div data-block="text"><p><strong>${escape(fremen[index].title)}${fremen[index].title ? ': ' : ''}</strong>${escape(fremen[index].paragraphs.join(' '))}</p></div>`;
const heading = (title, faction = false) =>
  `<h3 data-block="heading" class="section-bar${faction ? ' faction-bar' : ''}">${escape(title)}</h3>`;
const region = (name, content) =>
  `<section data-region="${escape(name)}"><span class="region-heading">${escape(name)}</span>${content}</section>`;
const columns = (left, right) =>
  `<div class="reading-columns">${region('Column 1', left)}${region('Column 2', right)}</div>`;
const note = (title, body) =>
  `<aside class="callout" data-block="callout"><h4>${escape(title)}</h4><p>${escape(body)}</p></aside>`;
const figure = (asset, caption) =>
  `<figure data-block="figure"><img src="${asset}" alt="${escape(caption)}" /><figcaption>${escape(caption)}</figcaption></figure>`;
const qa = (q, a) =>
  `<dl class="qa" data-block="qa"><dt>${escape(q)}</dt><dd><strong>Answer: </strong>${escape(a)}</dd></dl>`;
const quote = `<aside class="quote" data-block="callout"><p>You are native to Dune and know its ways.</p><cite>Fremen player sheet</cite></aside>`;
const setup = `${heading('At start', true)}${rule(0)}${rule(1)}`;
const advantages = `${heading('Advantages', true)}${rule(3)}${rule(4)}`;
const worms = `${heading('Shai-Hulud', true)}${rule(5)}`;
const questions = [
  qa(
    'Are revived leaders still subject to turning traitor?',
    'Yes. Once a leader is a traitor they stay a traitor for the entire game even if revived.'
  ),
  qa(
    'Does the lasgun/shield explosion destroy the spice in the territory as well as the forces?',
    'Yes. All forces in the territory are lost, including those of players who were not involved in the battle.'
  ),
  qa(
    'When the Fremen bring reinforcements, must they include the Great Flat when counting the two territory range?',
    'No. Never include the Great Flat when counting the two territory range.'
  ),
  qa(
    "Can a player's forces that have moved into different sectors of the same territory move or ship as a group?",
    'Yes.'
  ),
];
const steps = `<ol class="steps" data-block="list"><li>Each player selects one traitor card to keep.</li><li>Players place their starting spice behind their shields.</li><li>Each faction places its forces as indicated on its player sheet.</li></ol>`;
const entries = specimens[1].sections
  .flatMap((section) => section.items)
  .filter((item) => item.asset)
  .slice(0, 3);
const entryList = entries
  .map(
    (item) =>
      `<div class="entry" data-block="entries"><img src="${escape(item.asset)}" alt="" /><div><h4>${escape(item.title)}</h4><p>${escape(item.paragraphs[0])}</p></div></div>`
  )
  .join('');
const tokenRail = () =>
  `<div class="outer-rail" data-region="Outer rail">${figure('./assets/location-ornithopter.png', 'Ornithopter')}${figure('./assets/location-spice-stash.png', 'Spice stash')}</div>`;
const faction = (id) => {
  const data =
    id === 'fremen'
      ? [
          'Fremen',
          'The Fremen are natives of Dune. They know the desert and travel on the planet with an advantage over their opponents.',
          'liet.jpg',
          'stilgar.png',
          'chani.png',
        ]
      : [
          'Atreides',
          'The Atreides are led by Paul Atreides. His prescient awareness and loyal lieutenants make the faction a powerful presence on Dune.',
          'paul.jpg',
          'duncan.png',
          'gurney.png',
        ];
  return `<article class="faction-panel" data-block="faction"><div class="faction-intro"><img src="/media/vector/logo/${id}.svg" alt="${data[0]} emblem" /><div><h4>${data[0]}</h4><p>${data[1]}</p></div></div><div class="leaders">${data
    .slice(2)
    .map((file) => `<img src="/media/image/leader/official/${file}" alt="${escape(file.split('.')[0])}" />`)
    .join('')}</div><p class="leader-caption">Ruler and leaders</p></article>`;
};

function sample(side) {
  const left = side === 'left';
  if (state.layout === 'cover' && left) {
    return `<img class="cover-art" src="/page/cover-a.svg" alt="Dune cover artwork" /><div class="cover-title"><img src="/page/dune_logo.svg" alt="Dune" /><p>Rulebook</p></div>`;
  }
  if (state.layout === 'cover') {
    return `<div class="frame-content"><h3 data-block="heading">Contents</h3>${region('Contents', `<div data-block="contents"><p><span>Introduction</span><span>2</span></p><p><span>Components</span><span>4</span></p><p><span>Set-up for play</span><span>6</span></p><p><span>Sequence of play</span><span>7</span></p><p><span>Faction rules</span><span>16</span></p><p><span>Questions and answers</span><span>22</span></p></div>`)}${heading('Credits')}${region('Credits', '<div data-block="credits"><p><strong>Game design</strong><br />Bill Eberle, Jack Kittredge, Peter Olotka</p><p><strong>Pattern study</strong><br />Dune Zone</p></div>')}</div>`;
  }
  let title = left ? 'Faction player sheets' : 'Questions and answers';
  let body;
  if (state.layout === 'single') {
    body = region(
      'Main text',
      `<div class="single-reading">${left ? setup + advantages + worms : heading('Revival') + questions[0] + heading('Set-up for play') + steps + note('Faction advantages', "A faction's particular advantages always have precedence over the rules.")}</div>`
    );
  } else if (state.layout === 'two') {
    body = left
      ? columns(setup + advantages, worms + note('Free revival', '3 forces. You cannot buy additional revivals.'))
      : columns(
          heading('Revival') + questions[0] + heading('Treachery cards') + questions[1],
          heading('Movement') + questions[2] + questions[3]
        );
  } else if (state.layout === 'rail') {
    body = `<div class="rail-grid">${left ? `<aside class="outer-rail" data-region="Outer rail">${figure('/media/vector/logo/fremen.svg', 'Fremen')}${quote}</aside>` : tokenRail()}${region('Main text', left ? heading('Fremen', true) + columns(setup + advantages, worms + note('Free revival', '3 forces. You cannot buy additional revivals.')) : columns(heading('Movement') + questions[2] + questions[3], heading('Revival') + questions[0]))}</div>`;
  } else if (state.layout === 'figure') {
    title = left ? 'Game components' : 'Set-up for play';
    body = left
      ? `<div class="figure-grid">${region('Large figure', figure('/page/map.svg', 'The game board'))}${region('Explanation', heading('The planet Dune') + '<div data-block="text"><p>The game board is a map of the northern hemisphere of Dune.</p><p><strong>Sand:</strong> yellow or tan territories.</p><p><strong>Rock:</strong> brown territories.</p><p><strong>Strongholds:</strong> red territories.</p></div>' + note('Spice blows', 'Spice Blow cards identify territories where spice appears.'))}</div>`
      : `${region('Figure strip', `<div class="outer-rail" style="display:flex;gap:24px;padding:0;margin-bottom:24px">${figure('./assets/location-spice-stash.png', 'Spice')}${figure('./assets/location-ornithopter.png', 'Movement')}</div>`)}${columns(heading('Preparation') + steps, heading('Faction forces') + rule(0) + rule(1))}`;
  } else if (state.layout === 'band') {
    title = left ? 'Base game factions' : 'Quick reference';
    const table = `<table data-block="table"><thead><tr><th>Faction</th><th>Free revival</th></tr></thead><tbody><tr><td>Atreides</td><td>2 forces</td></tr><tr><td>Fremen</td><td>3 forces</td></tr></tbody></table>`;
    body = `<div class="wide-region">${region('Spanning region', left ? faction('fremen') : table)}</div>${left ? columns(advantages, worms) : columns(heading('Revival') + questions[0], note('Fremen revival', 'You cannot buy additional revivals.'))}`;
  } else {
    title = left ? 'Base game factions' : 'Faction and token reference';
    body = left
      ? region('Repeated panels', faction('fremen') + faction('atreides'))
      : region('Repeated entries', faction('atreides') + heading('Location tokens') + entryList);
  }
  return `<div class="frame-content"><h3 data-block="heading">${title}</h3>${body}</div>`;
}

function fit() {
  const [w, h] = formats[state.format];
  const scale = Math.min(1, $('spread-window').clientWidth / (w * 2 + 2));
  $('spread').style.width = `${w * 2 + 2}px`;
  $('spread').style.marginLeft = `${Math.max(0, ($('spread-window').clientWidth - (w * 2 + 2) * scale) / 2)}px`;
  $('spread').style.transform = `scale(${scale})`;
  $('spread-window').style.height = `${h * scale}px`;
}

function render() {
  const [w, h, label] = formats[state.format];
  const current = layouts.find(([id]) => id === state.layout);
  $('design').value = state.design;
  $('format').value = state.format;
  $('design-note').textContent = designs[state.design][1];
  $('design-label').textContent = designs[state.design][0];
  $('preview-title').textContent = current[1];
  $('layout-note').textContent = current[2];
  $('size-note').textContent = `${label} / facing pages`;
  $('source-note').textContent =
    `Pattern reference: ${current[3]}. The illustrated footer is the original artwork from the previous JSX rulebook.`;
  $('layout-options').innerHTML = layouts
    .map(
      ([id, name]) =>
        `<button type="button" class="layout-choice" data-layout="${id}" aria-pressed="${id === state.layout}"><span aria-hidden="true" class="wire ${id}">${'<i></i>'.repeat(['band', 'rail'].includes(id) ? 3 : ['single', 'cover'].includes(id) ? 1 : 2)}</span>${name}</button>`
    )
    .join('');
  $('spread').innerHTML = ['left', 'right']
    .map(
      (side, index) =>
        `<article class="paper${state.layout === 'cover' && !index ? ' cover' : ''}" data-side="${side}" data-design="${state.design}" data-format="${state.format}" style="--paper-w:${w}px;--paper-h:${h}px" aria-label="${side} page">${sample(side)}${state.layout === 'cover' && !index ? '' : `<span class="folio">${index + 6}</span>`}</article>`
    )
    .join('');
  const used = new Set([...$('spread').querySelectorAll('[data-block]')].map((element) => element.dataset.block));
  $('block-options').innerHTML = blocks
    .map(
      ([id, title, fields]) =>
        `<article class="block-option" data-active="${used.has(id)}"><h3>${title}</h3><p>${fields}</p></article>`
    )
    .join('');
  history.replaceState(null, '', `${location.pathname}?${new URLSearchParams(state)}`);
  window.__patternStudy = { ...state, blocks: [...used] };
  fit();
}

$('design').addEventListener('change', (event) => {
  state.design = event.target.value;
  render();
});
$('format').addEventListener('change', (event) => {
  state.format = event.target.value;
  render();
});
$('outlines').addEventListener('change', (event) =>
  document.body.classList.toggle('show-regions', event.target.checked)
);
$('layout-options').addEventListener('click', (event) => {
  const button = event.target.closest('[data-layout]');
  if (button) {
    state.layout = button.dataset.layout;
    render();
  }
});
function cycle() {
  state.design = state.design === 'illustrated' ? 'restrained' : 'illustrated';
  render();
}
$('previous').addEventListener('click', cycle);
$('next').addEventListener('click', cycle);
window.addEventListener('keydown', (event) => {
  if (
    !event.target.closest('input, select, textarea, [contenteditable]') &&
    ['ArrowLeft', 'ArrowRight'].includes(event.key)
  ) {
    event.preventDefault();
    cycle();
  }
});
window.addEventListener('resize', fit);
render();
await document.fonts.ready;
fit();
