import { createRoot } from 'react-dom/client';

import '@fontsource/caladea/latin-400.css';
import '@fontsource/caladea/latin-400-italic.css';
import '@fontsource/caladea/latin-700.css';
import '@fontsource/caladea/latin-700-italic.css';
import { RulebookDocumentRenderer } from '../../../src/game/rulebook/RulebookRenderer';
import '../../../src/app/styles/fonts.css';
import document from './render-document.json';

const params = new URLSearchParams(location.search);
const selected = Number(params.get('page'));
const pages = selected ? [document.pageOrder[selected - 1]].filter(Boolean) : document.pageOrder;

createRoot(window.document.getElementById('root')!).render(
  <>
    <header className="previewToolbar">
      <strong>GF9 2.0 rulebook draft</strong>
      <span>Local preview. Source wording and uncertainty markers retained.</span>
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
      label="GF9 2.0 draft"
    />
  </>
);
