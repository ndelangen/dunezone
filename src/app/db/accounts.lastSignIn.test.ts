// @vitest-environment jsdom

import { afterEach, expect, test } from 'vite-plus/test';

import { noteSignInStarted, settleStartedSignIn } from './accounts';

const last = () => localStorage.getItem('dunezone-last-sign-in');

afterEach(() => localStorage.clear());

test('a finished sign-in becomes the last one used', () => {
  noteSignInStarted('discord');
  settleStartedSignIn(true);
  expect(last()).toBe('discord');
  expect(localStorage.getItem('dunezone-sign-in-started')).toBeNull();
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
  localStorage.setItem('dunezone-sign-in-started', 'myspace');
  settleStartedSignIn(true);
  expect(last()).toBeNull();
});
