// Shared by the <chocabloc-help> browser tests. Not a test file itself (wtr runs *.browser.test.ts only).
// The readers here return strings and numbers, never DOM nodes: the runner can hang for its whole
// timeout serializing a failed assertion that holds a custom element.
import type { ChocaHelp, HelpFact, HelpPicture } from '../../src/help/index';
import { holder, part } from './lesson-test-utils';
import { drawnProblems } from './help-drawn-check';

export const mult = (a: number | null, b: number | null, c: number | null = null): HelpFact => ({ op: 'mult', a, b, c });
export const div = (a: number | null, b: number | null, c: number | null = null): HelpFact => ({ op: 'div', a, b, c });
export const BASE = new URL('../fixtures/animals/', import.meta.url).pathname;

export type Props = Partial<Pick<ChocaHelp, 'fact' | 'grade' | 'pick' | 'solved' | 'draw' | 'translator' | 'pictureBase' | 'muted'>>;

export function mountHelp(props: Props = {}): ChocaHelp {
  const el = document.createElement('chocabloc-help') as ChocaHelp;
  Object.assign(el, props);
  holder().append(el);
  return el;
}

export function opened(props: Props): ChocaHelp {
  const el = mountHelp(props);
  el.open();
  return el;
}

export const the = (el: HTMLElement, name: string): HTMLElement => {
  const p = part(el, name);
  if (!p) throw new Error(`no part ${name}`);
  return p;
};
export const say = (el: HTMLElement): string | null => the(el, 'text').textContent;
export const way = (el: HTMLElement): string | null => the(el, 'way').textContent;
export const click = (el: HTMLElement, name: string): void => the(el, name).click();
export const isOpen = (el: HTMLElement): boolean => !the(el, 'panel').hidden;
export const labels = (el: HTMLElement): (string | null)[] =>
  Array.from(the(el, 'picture').querySelectorAll('[data-help-role]')).map((e) => e.textContent);
export const roles = (el: HTMLElement): (string | null)[][] =>
  Array.from(the(el, 'text').querySelectorAll('[data-help-role]')).map((e) => [e.textContent, e.getAttribute('data-help-role')]);
export const hasTap = (el: HTMLElement): boolean => part(el, 'tap-to-hear') !== null;
export const focusedPart = (el: HTMLElement): string | null | undefined =>
  (el.shadowRoot as ShadowRoot).activeElement?.getAttribute('part');
export const count = (el: HTMLElement, selector: string): number => the(el, 'picture').querySelectorAll(selector).length;

export function events<T>(el: HTMLElement, type: string): T[] {
  const got: T[] = [];
  el.addEventListener(type, (e) => got.push((e as CustomEvent<T>).detail));
  return got;
}

/** What the kid can see and hear right now, against the oracle. */
export const check = (el: HTMLElement, fact: HelpFact, spoken: string[] = [], picture?: HelpPicture | null, wayLine?: string): string[] =>
  drawnProblems(el, {
    fact,
    spoken,
    ...(picture !== undefined ? { picture } : {}),
    ...(wayLine !== undefined ? { way: wayLine } : {}),
  });
