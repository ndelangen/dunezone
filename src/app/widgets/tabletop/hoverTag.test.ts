import { afterEach, expect, test, vi } from 'vite-plus/test';

import { createHoverTag, HOVER_TAG_GRACE_MS } from './hoverTag';

afterEach(() => {
  vi.useRealTimers();
});

test('a tag holds through a slip off its piece shorter than the grace', () => {
  vi.useFakeTimers();
  const tag = createHoverTag();
  const gone = vi.fn();
  tag.show('stack');
  tag.leave('stack', gone);
  vi.advanceTimersByTime(HOVER_TAG_GRACE_MS - 1);
  tag.show('stack');
  vi.advanceTimersByTime(HOVER_TAG_GRACE_MS * 2);
  expect(tag.shows('stack')).toBe(true);
  expect(gone).not.toHaveBeenCalled();
});

test('a tag goes once the pointer stays off past the grace, and takes what ends with it', () => {
  vi.useFakeTimers();
  const tag = createHoverTag();
  const gone = vi.fn();
  tag.show('stack');
  tag.leave('stack', gone);
  vi.advanceTimersByTime(HOVER_TAG_GRACE_MS);
  expect(tag.shows('stack')).toBe(false);
  expect(gone).toHaveBeenCalledOnce();
});

test('one piece shows a tag at a time, and reaching another moves it at once', () => {
  vi.useFakeTimers();
  const tag = createHoverTag();
  const gone = vi.fn();
  tag.show('first');
  tag.leave('first', gone);
  tag.show('second');
  expect(tag.shows('first')).toBe(false);
  expect(tag.shows('second')).toBe(true);
  vi.advanceTimersByTime(HOVER_TAG_GRACE_MS * 2);
  expect(tag.shows('second')).toBe(true);
  expect(gone).not.toHaveBeenCalled();
});

test('a dropped piece or a cleared table loses its tag at once', () => {
  const tag = createHoverTag();
  const changes = vi.fn();
  tag.subscribe(changes);
  tag.show('stack');
  tag.drop('other');
  expect(tag.shows('stack')).toBe(true);
  tag.drop('stack');
  expect(tag.shows('stack')).toBe(false);
  tag.show('stack');
  tag.clear();
  expect(tag.shows('stack')).toBe(false);
  expect(changes).toHaveBeenCalledTimes(4);
});

test('a tag on its way out that is cleared or dropped still takes what ends with it', () => {
  vi.useFakeTimers();
  const tag = createHoverTag();
  const cleared = vi.fn();
  tag.show('stack');
  tag.leave('stack', cleared);
  tag.clear();
  expect(cleared).toHaveBeenCalledOnce();
  const dropped = vi.fn();
  tag.show('stack');
  tag.leave('stack', dropped);
  tag.drop('stack');
  expect(dropped).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(HOVER_TAG_GRACE_MS * 2);
  expect(cleared).toHaveBeenCalledOnce();
  expect(dropped).toHaveBeenCalledOnce();
});

test('a pressed button hides the tag at once and keeps every tag hidden until it is let go', () => {
  const tag = createHoverTag();
  tag.show('stack');
  tag.press();
  expect(tag.shows('stack')).toBe(false);
  tag.show('stack');
  tag.show('other');
  expect(tag.shows('stack')).toBe(false);
  expect(tag.shows('other')).toBe(false);
  tag.release();
  tag.show('stack');
  expect(tag.shows('stack')).toBe(true);
});

test('leaving a piece whose tag a press already took down ends what goes with the hover at once', () => {
  const tag = createHoverTag();
  const gone = vi.fn();
  tag.show('locked');
  tag.press();
  tag.leave('locked', gone);
  expect(gone).toHaveBeenCalledOnce();
});

test('leaving a piece while another shows its tag leaves the other alone', () => {
  const tag = createHoverTag();
  const gone = vi.fn();
  tag.show('next');
  tag.leave('previous', gone);
  expect(gone).not.toHaveBeenCalled();
  expect(tag.shows('next')).toBe(true);
});
