/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vite-plus/test';

import { Held, HeldSlot, useHeldNode } from './HeldContent';

afterEach(cleanup);

/* Two layouts that show the same held content in different places, as the table's layouts do when the window crosses the columns' width. */
function Layouts({ layout }: Readonly<{ layout: 'left' | 'right' }>) {
  const node = useHeldNode();
  return (
    <>
      <Held node={node}>
        <textarea aria-label="Message" />
      </Held>
      {layout === 'left' ? (
        <section key="left" aria-label="Left">
          <HeldSlot node={node} />
        </section>
      ) : (
        <div key="right">
          <aside aria-label="Right">
            <HeldSlot node={node} />
          </aside>
        </div>
      )}
    </>
  );
}

test('a layout switch keeps the held content mounted, focused, and its caret where it was', () => {
  const { rerender } = render(<Layouts layout="left" />);
  const message = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message' });
  message.value = 'half typed';
  message.focus();
  message.setSelectionRange(4, 4);

  rerender(<Layouts layout="right" />);
  expect(screen.getByRole('complementary', { name: 'Right' }).contains(message)).toBe(true);
  expect(message.value).toBe('half typed');
  expect(document.activeElement).toBe(message);
  expect([message.selectionStart, message.selectionEnd]).toEqual([4, 4]);
});

test('a switch while the focus is elsewhere leaves it there', () => {
  const { rerender } = render(
    <>
      <button type="button">Elsewhere</button>
      <Layouts layout="left" />
    </>
  );
  const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
  elsewhere.focus();
  rerender(
    <>
      <button type="button">Elsewhere</button>
      <Layouts layout="right" />
    </>
  );
  expect(document.activeElement).toBe(elsewhere);
});

test('a layout switch keeps where the held content was scrolled to', () => {
  function Scrolled({ layout }: Readonly<{ layout: 'left' | 'right' }>) {
    const node = useHeldNode();
    return (
      <>
        <Held node={node}>
          <div data-testid="history" />
        </Held>
        {layout === 'left' ? (
          <section key="left">
            <HeldSlot node={node} />
          </section>
        ) : (
          <aside key="right">
            <HeldSlot node={node} />
          </aside>
        )}
      </>
    );
  }
  const { rerender } = render(<Scrolled layout="left" />);
  const history = screen.getByTestId('history');
  history.scrollTop = 120;
  rerender(<Scrolled layout="right" />);
  expect(history.scrollTop).toBe(120);
});
