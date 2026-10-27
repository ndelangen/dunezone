import { createRoot } from 'react-dom/client';

import { RulebookDocumentRenderer } from '../../../../src/game/rulebook/RulebookRenderer';
import '@fontsource/caladea/latin-400.css';
import '@fontsource/caladea/latin-400-italic.css';
import '@fontsource/caladea/latin-700.css';
import '@fontsource/caladea/latin-700-italic.css';
import type { RulebookRenderDocumentV1 } from '../../../../src/shared/rulebooks/renderDocument';
import '../../../../src/app/styles/fonts.css';
const document = (await fetch('/render-document.json').then((response) => response.json())) as RulebookRenderDocumentV1;

const params = new URLSearchParams(location.search);
const selected = Number(params.get('page'));
const pages = selected ? [document.pageOrder[selected - 1]].filter(Boolean) : document.pageOrder;

createRoot(window.document.getElementById('root')!).render(
  <>
    <header className="previewToolbar">
      <strong>GF9 Advanced to Dreamrules</strong>
      <span>Local review draft. Changes from GF9 2019 Advanced, including the later Dreamrules rulings.</span>
      <nav aria-label="Draft pages">
        <a href="/">All pages</a>
        {selected > 1 ? <a href={`/?page=${selected - 1}`}>Previous</a> : null}
        <select
          aria-label="Page"
          defaultValue={selected || 0}
          onChange={(event) => {
            location.href = Number(event.target.value) ? `/?page=${event.target.value}` : '/';
          }}
        >
          <option value={0}>All pages</option>
          {document.pageOrder.map((id, index) => (
            <option key={id} value={index + 1}>
              Page {index + 1}: {document.pagesById[id as keyof typeof document.pagesById].title}
            </option>
          ))}
        </select>
        {selected && selected < document.pageOrder.length ? <a href={`/?page=${selected + 1}`}>Next</a> : null}
      </nav>
    </header>
    <RulebookDocumentRenderer
      document={{ ...document, pageOrder: pages } as any}
      pageOffset={selected ? selected - 1 : 0}
      label="GF9 Advanced to Dreamrules review"
    />
  </>
);
