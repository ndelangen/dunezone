import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { chromium } from 'playwright';
import { expect, test } from 'vite-plus/test';

import type * as FaqFixture from './faqDetail.stories.fixture';

async function compilePickerFixture() {
  const compiled = await build({
    stdin: {
      contents: "export { openReferencePicker } from './faqDetail.stories.fixture';",
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'faqProof',
    plugins: [
      {
        name: 'unused-forum-data',
        setup(builder) {
          /* This check runs the picker interaction, without the separate forum database builder. */
          builder.onResolve({ filter: /^@db\/storybook$/ }, () => ({ path: 'unused', namespace: 'fixture' }));
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents: 'export const ref = () => {}; export const ruleset = () => {};',
          }));
        },
      },
    ],
  });
  return compiled.outputFiles[0]!.text;
}

test('the FAQ picker wait finishes a stalled entrance and still rejects a hidden dialog', async () => {
  const source = await compilePickerFixture();
  const browser = await chromium.launch();
  try {
    for (const hidden of [false, true]) {
      const page = await browser.newPage();
      try {
        await page.setContent(`<!doctype html>
          <style>
            @keyframes enter { from { opacity: 0 } to { opacity: 1 } }
            [role=dialog] { animation: enter 1000s paused; opacity: 1; }
          </style>
          <h1>When should we declare a Karama card?</h1><button>Add references</button>`);
        await page.addScriptTag({ content: source });
        await page.evaluate((hide) => {
          document.querySelector('button')!.addEventListener('click', () => {
            const picker = document.createElement('div');
            picker.setAttribute('role', 'dialog');
            picker.setAttribute('aria-label', 'Add references');
            if (hide) {
              picker.style.visibility = 'hidden';
            }
            picker.innerHTML =
              '<input role="combobox" aria-label="Reference type" value="card-treachery">' +
              '<input type="search" aria-label="Search treachery cards"><div role="option">Lasgun</div>';
            document.body.append(picker);
          });
        }, hidden);
        const outcome = await page.evaluate(async () => {
          const proof = (window as unknown as { faqProof: typeof FaqFixture }).faqProof;
          try {
            await proof.openReferencePicker({ canvasElement: document.body });
            return 'visible';
          } catch (error) {
            return (error as Error).message;
          }
        });
        if (hidden) {
          expect(outcome).toContain('Unable to find role="dialog"');
        } else {
          expect(outcome).toBe('visible');
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}, 20_000);
