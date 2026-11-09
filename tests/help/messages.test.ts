import { describe, test, expect, vi } from 'vitest';
import { STRATEGIES } from '../../src/help/catalog';
import { createHelpMessages, helpMessagesEn } from '../../src/help/messages';
import en from '../../src/help/messages/en.json';
import { lookup } from '../../src/lesson/messages';
import { speakableText } from '../../src/lesson/speak-text';

/** Every string under a node of the message table. */
function strings(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  return Object.values(node as object).flatMap(strings);
}

describe('createHelpMessages', () => {
  test('gives the English words with their numbers', () => {
    const msg = createHelpMessages({ lang: 'en' });
    expect(msg('mult.groups.ask', { givenRows: 7, givenEach: 8 })).toBe(
      '7 rows of 8. How many in all?',
    );
    expect(msg('panel.way', { index: 1, count: 4, name: 'Equal groups' })).toBe(
      'Way 1 of 4: Equal groups',
    );
  });

  test('a translator answers first; what it leaves falls back to English', () => {
    const msg = createHelpMessages({
      lang: 'fr',
      translator: (key) => (key === 'panel.more' ? 'Encore' : undefined),
    });
    expect(msg('panel.more')).toBe('Encore');
    expect(msg('panel.back')).toBe('Back');
  });

  test('a missing key shows the key, with one warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const msg = createHelpMessages({ lang: 'en' });
      expect(msg('panel.nothing')).toBe('panel.nothing');
      expect(msg('panel.nothing')).toBe('panel.nothing');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe('[chocabloc-help] missing message: panel.nothing');
    } finally {
      warn.mockRestore();
    }
  });

  test('a bad language tag from the host page does not throw', () => {
    expect(createHelpMessages({ lang: 'not a lang!' })('panel.back')).toBe('Back');
  });

  test('never falls back to the lesson table', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      // "gotIt" is a lesson word, and help must not pull the lesson's table into its bundle.
      expect(createHelpMessages({ lang: 'en' })('gotIt')).toBe('gotIt');
    } finally {
      warn.mockRestore();
    }
  });

  test('helpMessagesEn is the shipped table', () => {
    expect(helpMessagesEn).toBe(en);
  });
});

describe('the panel words', () => {
  test('every strategy has a name, in the teacher label words', () => {
    const names = Object.fromEntries(STRATEGIES.map((s) => [s.id, lookup(en, `name.${s.id}`)]));
    expect(names).toEqual({
      'mult.groups': 'Equal groups',
      'mult.skip-count': 'Skip counting',
      'mult.known-fact': 'Start from a fact you know',
      'mult.nearby-fact': 'Look at a nearby fact',
      'div.share': 'Share into equal groups',
      'div.groups': 'How many groups?',
      'div.think-mult': 'Think multiplication',
      'div.array': 'Array',
    });
    // No more names than strategies.
    expect(strings(en.name)).toHaveLength(STRATEGIES.length);
  });

  test('every step line, and the fallback, can be spoken with the symbols help ships', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const msg = createHelpMessages({ lang: 'en' });
      const lines = [...strings(en.mult), ...strings(en.div), en.panel.fallback, en.panel.again];
      for (const line of lines) speakableText(line, msg);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
