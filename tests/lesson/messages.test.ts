import { describe, test, expect, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  lookup,
  isPluralForms,
  interpolate,
  selectMessage,
  createMessages,
} from '../../src/lesson/messages';
import en from '../../src/lesson/messages/en.json';

const EN = new Intl.PluralRules('en');

describe('lookup', () => {
  const table = {
    notFound: { subtitle: 'Gone', messages: ['a', 'b'] },
    students: { one: '{count} student', other: '{count} students' },
  };
  test('a dotted key finds a nested value of any shape', () => {
    expect(lookup(table, 'notFound.subtitle')).toBe('Gone');
    expect(lookup(table, 'notFound.messages')).toEqual(['a', 'b']);
    expect(lookup(table, 'notFound')).toEqual(table.notFound);
  });
  test('a missing key, or one that runs through a string, is undefined', () => {
    expect(lookup(table, 'notFound.nope')).toBeUndefined();
    expect(lookup(table, 'notFound.subtitle.deeper')).toBeUndefined();
    expect(lookup(null, 'a')).toBeUndefined();
  });
  test('inherited properties are never found', () => {
    expect(lookup(table, 'constructor')).toBeUndefined();
    expect(lookup(table, 'notFound.toString')).toBeUndefined();
  });
});

describe('isPluralForms', () => {
  test('plural categories with an "other" string are plural forms', () => {
    expect(isPluralForms({ one: 'a', other: 'b' })).toBe(true);
    expect(isPluralForms({ other: 'b' })).toBe(true);
    expect(isPluralForms({ zero: 'z', one: 'a', two: 't', few: 'f', many: 'm', other: 'b' })).toBe(true);
  });
  test('a group of keys, a list, or forms without "other" are not', () => {
    expect(isPluralForms({ one: 'a' })).toBe(false);
    expect(isPluralForms({ one: 'a', other: 'b', title: 'x' })).toBe(false);
    expect(isPluralForms({ other: 3 })).toBe(false);
    expect(isPluralForms(['a'])).toBe(false);
    expect(isPluralForms('a')).toBe(false);
  });
});

describe('interpolate', () => {
  test('{name} is replaced by String(vars.name)', () => {
    expect(interpolate('Hello {name}, you have {coins} coins', { name: 'Ada', coins: 3 })).toBe('Hello Ada, you have 3 coins');
    expect(interpolate('{n} and {n}', { n: 0 })).toBe('0 and 0');
  });
  test('a missing value leaves {name} in place', () => {
    expect(interpolate('Hi {name} {other}', { name: 'Ada' })).toBe('Hi Ada {other}');
    expect(interpolate('Hi {name}', undefined)).toBe('Hi {name}');
    expect(interpolate('Hi {name}', { name: undefined })).toBe('Hi {name}');
  });
  test('only identifier-shaped placeholders are placeholders', () => {
    expect(interpolate('{ a } {1} {value2}', { a: 'x', 1: 'y', value2: 'z' })).toBe('{ a } {1} z');
  });
  test('an inherited name is not a value', () => {
    expect(interpolate('{constructor}', {})).toBe('{constructor}');
  });
  test('a value is inserted as-is, never re-read as a placeholder', () => {
    expect(interpolate('{a} {b}', { a: '{b}', b: 'B' })).toBe('{b} B');
  });
});

describe('selectMessage', () => {
  const forms = { one: '{count} student', other: '{count} students' };
  test('a string is returned as it is', () => {
    expect(selectMessage('Hi', undefined, EN)).toBe('Hi');
  });
  test('plural forms pick the category Intl.PluralRules gives for count', () => {
    expect(selectMessage(forms, { count: 1 }, EN)).toBe('{count} student');
    expect(selectMessage(forms, { count: 0 }, EN)).toBe('{count} students');
    expect(selectMessage(forms, { count: 7 }, EN)).toBe('{count} students');
  });
  test('a category the forms lack, or no numeric count, falls back to "other"', () => {
    expect(selectMessage({ other: '{count} sheep' }, { count: 1 }, EN)).toBe('{count} sheep');
    expect(selectMessage(forms, undefined, EN)).toBe('{count} students');
    expect(selectMessage(forms, { count: '1' }, EN)).toBe('{count} students');
  });
  test('another language picks its own categories', () => {
    const forms3 = { one: 'one', few: 'few', many: 'many', other: 'other' };
    const pl = new Intl.PluralRules('pl');
    expect(selectMessage(forms3, { count: 1 }, pl)).toBe('one');
    expect(selectMessage(forms3, { count: 3 }, pl)).toBe('few');
    expect(selectMessage(forms3, { count: 5 }, pl)).toBe('many');
  });
  test('a list, a group of keys or nothing is not a message', () => {
    expect(selectMessage(['a'], undefined, EN)).toBeUndefined();
    expect(selectMessage({ title: 'x' }, undefined, EN)).toBeUndefined();
    expect(selectMessage(undefined, undefined, EN)).toBeUndefined();
  });
});

describe('createMessages', () => {
  test('a translator that answers wins', () => {
    const msg = createMessages({ lang: 'fr', translator: (k) => (k === 'readToMe' ? 'Lis-moi' : undefined) });
    expect(msg('readToMe')).toBe('Lis-moi');
  });
  test('a translator returning undefined falls back to English', () => {
    const msg = createMessages({ lang: 'en', translator: () => undefined });
    expect(msg('readToMe')).toBe('Read to me');
    expect(createMessages({ lang: 'en' })('gotIt')).toBe('Got it');
  });
  test('English plural forms follow vars.count', () => {
    const msg = createMessages({ lang: 'en' });
    expect(msg('base10.tens', { count: 1 })).toBe('1 ten');
    expect(msg('base10.tens', { count: 3 })).toBe('3 tens');
  });
  test('interpolates vars into plain messages', () => {
    expect(createMessages({ lang: 'en' })('feedback.answerIs', { answer: 0 })).toBe('The answer is 0.');
  });
  test('a translator returning plural forms is picked by the page language', () => {
    const forms = { one: 'one', few: 'few', many: 'many', other: 'other' };
    const msg = createMessages({ lang: 'pl', translator: () => forms as unknown as string });
    expect(msg('base10.tens', { count: 3 })).toBe('few');
  });
  test('a key missing everywhere returns the key and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const msg = createMessages({ lang: 'en' });
    expect(msg('nope.nothing')).toBe('nope.nothing');
    expect(msg('nope.nothing')).toBe('nope.nothing');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('message keys', () => {
  test('every msg(\'…\') key used in src/lesson exists in en.json', () => {
    const used = new Set<string>();
    for (const f of tsFiles(join(__dirname, '../../src/lesson'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bmsg\(\s*'([^']+)'/g)) used.add(m[1]!);
    }
    const missing = [...used].filter((k) => lookup(en, k) === undefined);
    expect(missing).toEqual([]);
  });
});
