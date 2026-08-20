import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@app/print/sheet/sheet-page.css';
import '@app/styles/fonts.css';
import '@app/styles/tokens.css';

import '@fontsource/caladea/latin-400.css';
import '@fontsource/caladea/latin-400-italic.css';
import '@fontsource/caladea/latin-700.css';
import '@fontsource/caladea/latin-700-italic.css';
import './capture-page.css';
import { PublisherCapture } from './PublisherCapture';

const root = document.querySelector('#root');
if (!root) {
  throw new Error('Missing capture root');
}

createRoot(root).render(
  <StrictMode>
    <PublisherCapture />
  </StrictMode>
);
