import { renderClassic } from './classic.mjs';
/** The review controls are local to this throwaway document entry. */
import { formats } from './core.mjs';
import { renderGuided } from './guided.mjs';
import { renderReference } from './reference.mjs';
import { specimens } from './specimens.mjs';

const variants = [
  { id: 'A', name: 'Classic columns', description: 'Reading order with compact illustrations', render: renderClassic },
  { id: 'B', name: 'Guided sections', description: 'Section rails and horizontal reading bands', render: renderGuided },
  {
    id: 'C',
    name: 'Reference panels',
    description: 'Individual entries with repeated context',
    render: renderReference,
  },
];
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = {
  variant: params.get('variant') || 'A',
  format: params.get('format') || 'square',
  specimen: params.get('specimen') || specimens[0].id,
};
const specimenSelect = $('specimen');
for (const specimen of [...specimens, { id: 'all', title: 'All specimens' }]) {
  specimenSelect.add(new Option(specimen.title, specimen.id));
}
for (const format of formats) {
  $('format').add(new Option(`${format.label} / ${format.width} × ${format.height} mm`, format.id));
}
specimenSelect.value = state.specimen;
$('format').value = state.format;

function setZoom() {
  const format = formats.find((item) => item.id === state.format) || formats[0];
  const chosen = $('zoom').value;
  const scale = chosen === 'fit' ? Math.min(1, (innerWidth - 32) / ((format.width * 96) / 25.4)) : Number(chosen);
  $('pages').style.zoom = String(scale);
}

function render() {
  window.__prototypeReady = false;
  const variant = variants.find((item) => item.id === state.variant) || variants[0];
  const format = formats.find((item) => item.id === state.format) || formats[0];
  const selected =
    state.specimen === 'all' ? specimens : [specimens.find((item) => item.id === state.specimen) || specimens[0]];
  const host = $('pages');
  host.replaceChildren();
  host.style.zoom = '1';
  const allPages = [];
  const placements = [];
  for (const specimen of selected) {
    const result = variant.render(host, specimen, format);
    for (const placement of result.placements) {
      placements.push({ specimen: specimen.id, ...placement, page: placement.page + allPages.length });
    }
    allPages.push(...result.pages);
  }
  allPages.forEach((page, index) => {
    page.dataset.page = String(index + 1);
    page.querySelector('.folio').textContent = String(index + 1);
  });
  const expectedIds = selected.flatMap((specimen) =>
    specimen.sections.flatMap((section) => section.items.map((item) => item.id))
  );
  const actualIds = [...host.querySelectorAll('[data-content-id]')].map((node) => node.dataset.contentId);
  const missing = expectedIds.filter((id) => !actualIds.includes(id));
  const duplicate = actualIds.filter((id, index) => actualIds.indexOf(id) !== index);
  const geometryOverflow = [...host.querySelectorAll('.content-unit')]
    .filter((item) => {
      const pageBody = item.closest('.prototype-page').querySelector('.page-body').getBoundingClientRect();
      const bounds = item.getBoundingClientRect();
      return (
        bounds.bottom > pageBody.bottom + 1 || bounds.right > pageBody.right + 1 || bounds.left < pageBody.left - 1
      );
    })
    .map((item) => item.dataset.contentId);
  const overflow = [...new Set([...placements.filter((p) => p.overflow).map((p) => p.id), ...geometryOverflow])];
  const evidence = {
    ...state,
    dimensionsMm: [format.width, format.height],
    bodyPt: 10.5,
    pageCount: allPages.length,
    contentCount: expectedIds.length,
    missing,
    duplicate,
    overflow,
    orderPreserved: JSON.stringify(expectedIds) === JSON.stringify(actualIds),
    placements,
  };
  window.__prototype = evidence;
  $('status').textContent =
    `${allPages.length} pages / ${expectedIds.length} content items / ${overflow.length} overflow / ${missing.length} missing / ${duplicate.length} repeated / 10.5 pt body`;
  $('state').textContent = JSON.stringify(evidence, null, 2);
  $('sources').replaceChildren(
    ...selected.map((specimen) => {
      const p = document.createElement('p');
      p.textContent = `${specimen.title}: ${specimen.source}`;
      return p;
    })
  );
  $('variant-label').textContent = `${variant.id} / ${variant.name}`;
  $('variant-description').textContent = variant.description;
  $('page-size').textContent = `@page { size: ${format.width}mm ${format.height}mm; margin: 0; }`;
  const query = new URLSearchParams(state);
  history.replaceState(null, '', `${location.pathname}?${query}`);
  setZoom();
  window.__prototypeReady = true;
}

function cycle(direction) {
  const index = variants.findIndex((item) => item.id === state.variant);
  state.variant = variants[(index + direction + variants.length) % variants.length].id;
  render();
}
$('previous').addEventListener('click', () => cycle(-1));
$('next').addEventListener('click', () => cycle(1));
$('specimen').addEventListener('change', () => {
  state.specimen = specimenSelect.value;
  render();
});
$('format').addEventListener('change', () => {
  state.format = $('format').value;
  render();
});
$('zoom').addEventListener('change', setZoom);
$('boundaries').addEventListener('change', () =>
  document.body.classList.toggle('show-blocks', $('boundaries').checked)
);
$('print').addEventListener('click', () => window.print());
window.addEventListener('resize', setZoom);
window.addEventListener('keydown', (event) => {
  if (event.target.closest('input, textarea, select, [contenteditable]')) {
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    cycle(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
await document.fonts.load('10.5pt Caladea');
await document.fonts.load('700 10.5pt Caladea');
await document.fonts.load('20pt Copperplate');
await document.fonts.ready;
render();
