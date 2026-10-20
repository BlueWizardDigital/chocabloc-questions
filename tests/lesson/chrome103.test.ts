import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LESSON_CSS } from '../../src/lesson/dom/styles';

// Old Chromebooks run Chrome 103. Every API and CSS feature below arrived after it
// (source: MDN browser compatibility data). structuredClone (98) and findLast (97) are fine.
const root = join(__dirname, '../../src/lesson');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|json)$/.test(name) ? [path] : [];
  });
}

const files = sources(root).filter((f) => f.endsWith('.ts'));

const CSS_TOO_NEW = ['dvh', 'svh', 'lvh', ':has(', '@container', 'container-type', 'color-mix('];
const JS_TOO_NEW = [
  '.toSorted(',
  '.toReversed(',
  '.toSpliced(',
  '.with(',
  'Promise.withResolvers',
  'Object.groupBy',
  'Map.groupBy',
  '.isWellFormed(',
  'Array.fromAsync',
  '.union(',
  '.intersection(',
];

describe('Chrome 103 scan of src/lesson', () => {
  test('finds the lesson sources it is meant to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  test.each(files.map((f) => [f.slice(root.length + 1), readFileSync(f, 'utf8')]))('%s uses no CSS newer than Chrome 103', (_name, text) => {
    for (const bad of CSS_TOO_NEW) expect(text, bad).not.toContain(bad);
  });

  test.each(files.map((f) => [f.slice(root.length + 1), readFileSync(f, 'utf8')]))('%s uses no JS API newer than Chrome 103', (_name, text) => {
    for (const bad of JS_TOO_NEW) expect(text, bad).not.toContain(bad);
  });

  test('the stylesheet has no CSS nesting (a rule inside a rule, or a leading &)', () => {
    expect(LESSON_CSS).not.toMatch(/&/);
    // Nesting means a `{` opens while another block is still open, outside an @media block.
    let depth = 0;
    let inMedia = false;
    for (const ch of LESSON_CSS.replace(/@media[^{]*\{/g, '\u0001')) {
      if (ch === '\u0001') inMedia = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        if (depth === 0) inMedia = false;
        else depth--;
      }
      expect(depth).toBeLessThanOrEqual(1);
    }
    expect(inMedia || depth === 0).toBe(true);
  });
});
