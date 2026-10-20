/** Three throwaway document compositions, switchable on one local review route. */
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { RulebookPageRenderer } from '../../../src/game/rulebook/RulebookRenderer';
import { AssetRenderModeProvider } from '../../../src/game/assets/assetRenderMode';
import { allCases, variants, renderPages, settingsFor, referenceImage } from './compositions';
import type { Variant } from './compositions';
import './prototype.css';
import './shipmentWalkthrough.css';

const revisionCaseIds = ['core-shipment', 'ixian-tech', 'ecaz-discovery'];
function samplePages(caseId: string, variant: Variant, focused = false) {
  const pages = renderPages(caseId, variant);
  return focused && caseId === 'ecaz-discovery' ? pages.slice(0, 1) : pages;
}
function PrototypePaper({ caseId, variant, leafIndex, focused = false }: { caseId: string; variant: Variant; leafIndex?: number; focused?: boolean }) {
  const item = allCases.find(item => item.id === caseId)!;
  const cases = focused ? allCases.filter(item => revisionCaseIds.includes(item.id)) : allCases;
  const precedingLeaves = cases.slice(0, cases.findIndex(item => item.id === caseId)).reduce((count, item) => count + samplePages(item.id, variant, focused).length, 0);
  return <>{samplePages(caseId, variant, focused).map((page, index) => leafIndex !== undefined && index !== leafIndex ? null : <div className="proof-paper" data-format={item.format} data-case={page.id} data-variant={variant} key={page.id}>
    <AssetRenderModeProvider mode="print"><RulebookPageRenderer page={page} settings={settingsFor(caseId)} pageNumber={precedingLeaves + 1 + index} /></AssetRenderModeProvider>
  </div>)}</>;
}
function ImagePaper({ image, format }: { image: string; format: string }) {
  return <div className="reference-paper" data-format={format}><img src={image} alt="Complete reference page at its physical aspect ratio" /></div>;
}
function App() {
  const initial = new URLSearchParams(location.search);
  const focused = initial.get('review') === 'revision-2';
  const activeCases = focused ? allCases.filter(item => revisionCaseIds.includes(item.id)) : allCases;
  const [variant, setVariant] = useState<Variant>(focused ? 'C' : (initial.get('variant') as Variant) || 'A');
  const [caseId, setCase] = useState(activeCases.find(item => item.id === initial.get('case'))?.id || (focused ? 'core-shipment' : 'core-setup'));
  const [scale, setScale] = useState(Number(initial.get('zoom') || '50'));
  const [comparison, setComparison] = useState(focused ? initial.get('view') === 'comparison' : initial.get('view') !== 'proposed');
  const print = initial.get('print') === '1';
  const comparisonPrint = initial.get('print') === 'comparison';
  const item = allCases.find(item => item.id === caseId)!;
  const selected = variants.find(item => item.key === variant) || variants[0];
  const changeVariant = (delta: number) => setVariant(variants[(variants.findIndex(item => item.key === variant) + delta + variants.length) % variants.length].key);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.set('variant', variant); params.set('case', caseId); params.set('zoom', String(scale)); params.set('view', comparison ? 'comparison' : 'proposed');
    history.replaceState(null, '', '?' + params);
    const listener = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
      if (!focused && event.key === 'ArrowLeft') changeVariant(-1);
      if (!focused && event.key === 'ArrowRight') changeVariant(1);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [variant, caseId, scale, comparison]);
  useEffect(() => {
    document.documentElement.dataset.prototypeReady = 'loading';
    let cancelled = false;
    (async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = resolve; image.onerror = resolve; })));
      if (!cancelled) document.documentElement.dataset.prototypeReady = 'ready';
    })();
    return () => { cancelled = true; };
  }, [variant, caseId, comparison]);
  if (comparisonPrint) return <div className="comparison-print-pack">{allCases.flatMap(item => renderPages(item.id, variant).map((page, index) => <section className="comparison-spread" key={page.id}>
    <h1>{item.title}{index ? ' continued' : ''} | Variant {variant} | matching physical scale</h1>
    <div className="comparison-spread-columns">
      <section><h2>Original GF9</h2><ImagePaper image={'/reference/' + referenceImage(item.id) + '.png'} format={item.format} /></section>
      <section><h2>First delivery, archived</h2><ImagePaper image={'/current/' + item.id + '.png'} format="current-a4" /></section>
      <section><h2>Proposed composition</h2><PrototypePaper caseId={item.id} variant={variant} leafIndex={index} /></section>
    </div>
  </section>))}</div>;
  if (print) return <div className="print-pack">{activeCases.map(item => <PrototypePaper key={item.id} caseId={item.id} variant={variant} focused={focused} />)}</div>;
  return <>
    <header className="review-header">
      <p className="eyebrow">{focused ? 'Focused revision review' : 'Throwaway document prototype'}</p>
      <h1>{focused ? 'C: revised visual explanations' : 'GF9 book composition review'}</h1>
      <p>{focused ? 'Review the expanded Shipment and Movement walkthrough, paired Tech Token rules and text flowing beside a Discovery card.' : 'Compare the original, the first delivery and a proposed composition at the same millimetre scale.'}</p>
      <div className="review-controls">
        <label>Sample <select value={caseId} onChange={event => setCase(event.target.value)}>{activeCases.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Scale <select value={scale} onChange={event => setScale(Number(event.target.value))}>{[35, 50, 65, 80, 100].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
        <label><input type="checkbox" checked={comparison} onChange={event => setComparison(event.target.checked)} /> Compare references</label>
        <a href={`?print=1&variant=${variant}${focused ? '&review=revision-2' : ''}`} target="_blank">Print sample pack</a>
      </div>
      <p className="scope-note">{focused ? 'C is the selected base. All four covers are accepted and omitted from this review. This pack contains only revised samples and remains a read-only prototype.' : 'A page-design discussion, not the working local database or a complete revised book. The first-delivery references are archived output. C now includes the revised visual teaching samples.'}</p>
    </header>
    <main className="review-stage">
      <div className="comparison" style={{ zoom: scale / 100 }}>
        {comparison ? <>
          <section className="comparison-column"><h2>Original GF9</h2><p>{item.format === 'core-square' ? '254 × 254 mm' : '132.08 × 254 mm'}</p><ImagePaper image={'/reference/' + referenceImage(caseId) + '.png'} format={item.format} /></section>
          <section className="comparison-column"><h2>First delivery</h2><p>210 × 297 mm · Archived production PDF</p><ImagePaper image={'/current/' + caseId + '.png'} format="current-a4" /></section>
        </> : null}
        <section className="comparison-column"><h2>{selected.key}. {selected.name}</h2><p>{selected.description}</p><PrototypePaper caseId={caseId} variant={variant} focused={focused} /></section>
      </div>
      <details className="review-evidence"><summary>Review evidence and scope</summary>
        <p>Page sizes are fixed to the measured originals. Covers retain their complete original image without an extra gradient, title or logo. Interior text uses ordered existing Blocks and named layout regions. No paragraph coordinates or FAQ entries.</p>
        {'sourceReferences' in item ? <><p>Sample scope: {item.subtitle}</p><ul>{item.sourceReferences.map(reference => <li key={reference}>{reference}</li>)}</ul><p>The original and first-delivery selections may span several pages. This preview shows a representative page; see content-notes.md for the full mapping.</p></> : <p>Cover input is the complete page 1 of the corresponding original GF9 PDF, rendered at 300 dpi. Embedded raster art keeps its source quality.</p>}
        <p>Prototype-only changes: exact format catalogue entries and a scoped full-cover shading override. These are review code and must be rewritten and verified before production.</p>
      </details>
    </main>
    {import.meta.env.DEV ? <nav className="prototype-switcher" aria-label="Prototype variation">{focused ? <span>C · Revised samples only</span> : <><button onClick={() => changeVariant(-1)} aria-label="Previous variation">←</button><span>{selected.key} · {selected.name}</span><button onClick={() => changeVariant(1)} aria-label="Next variation">→</button></>}</nav> : null}
  </>;
}
createRoot(document.getElementById('root')!).render(<App />);
