// @vitest-environment jsdom

import { afterEach, expect, test } from 'vite-plus/test';

import { noteSignInStarted, settleStartedSignIn } from './accounts';

const last = () => localStorage.getItem('dunezone-last-sign-in');

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test('a finished sign-in becomes the last one used', () => {
  noteSignInStarted('discord');
  settleStartedSignIn(true);
  expect(last()).toBe('discord');
  expect(sessionStorage.getItem('dunezone-sign-in-started')).toBeNull();
});

test('an abandoned or refused sign-in keeps the previous hint', () => {
  noteSignInStarted('google');
  settleStartedSignIn(true);
  noteSignInStarted('discord');
  settleStartedSignIn(false);
  expect(last()).toBe('google');
});

test('a sign-in this page never started, such as connecting a method, leaves the hint alone', () => {
  localStorage.setItem('dunezone-last-sign-in', 'google');
  settleStartedSignIn(true);
  expect(last()).toBe('google');
});

test('a stored value that is not a provider is ignored', () => {
  sessionStorage.setItem('dunezone-sign-in-started', 'myspace');
  settleStartedSignIn(true);
  expect(last()).toBeNull();
});

test("a browser-wide marker from another tab cannot settle this tab's sign-in", () => {
  localStorage.setItem('dunezone-sign-in-started', 'discord');
  settleStartedSignIn(true);
  expect(last()).toBeNull();
});

test('a sign-in stays pending in its tab while the completed hint is shared', () => {
  noteSignInStarted('google');
  expect(localStorage.getItem('dunezone-sign-in-started')).toBeNull();
  expect(sessionStorage.getItem('dunezone-sign-in-started')).toBe('google');
  settleStartedSignIn(true);
  expect(last()).toBe('google');
});
