/**
 * Lesson entry verification script.
 * Checks the built lesson entry exists, that it loads the practice code (and
 * with it <chocabloc-question>) only through one dynamic import, and that a
 * consumer bundle importing it carries the parser and registers both elements.
 *
 * Run after `npm run build`: node tests/lesson-dist-test.mjs
 */
import { build } from 'vite';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpDir = resolve(__dirname, '../.lesson-dist-tmp');
const dist = resolve(__dirname, '../dist');

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

/** Specifiers of a built file's static imports: `from "x"` and bare `import "x"`, not `import("x")`. */
function staticImports(code) {
  return [...code.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]);
}

/** A built file and every file it reaches through static imports. */
function staticClosure(file) {
  const seen = new Set();
  const queue = [file];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of staticImports(readFileSync(f, 'utf8'))) {
      if (spec.startsWith('.')) queue.push(resolve(dirname(f), spec));
    }
  }
  return [...seen];
}

const defines = (code, tag) => code.includes(`customElements.define("${tag}"`);

try {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  for (const f of ['../dist/lesson.mjs', '../dist/lesson/index.d.ts']) {
    if (!existsSync(resolve(__dirname, f))) fail(`${f.slice(3)} is missing`);
  }

  // Help must not load the practice code: one dynamic import, no static one.
  const lessonCode = readFileSync(resolve(dist, 'lesson.mjs'), 'utf8');
  const lazy = lessonCode.match(/\bimport\(\s*["'](\.\/chunks\/practice\.[^"']+\.mjs)["']\s*\)/);
  if (!lazy) fail('dist/lesson.mjs has no dynamic import("./chunks/practice.…")');
  // The young look is a second lazy chunk: one dynamic import, never a static one.
  if (!/\bimport\(\s*["']\.\/chunks\/young\.[^"']+\.mjs["']\s*\)/.test(lessonCode)) {
    fail('dist/lesson.mjs has no dynamic import("./chunks/young.…")');
  }
  if (staticClosure(resolve(dist, 'lesson.mjs')).some((f) => /[/\\]young\.[^/\\]+\.mjs$/.test(f))) {
    fail('dist/lesson.mjs reaches the young chunk through a static import');
  }
  const helpFiles = staticClosure(resolve(dist, 'lesson.mjs'));
  // The pictures chunk (shares, counted rows of dots) is a third: one dynamic import, never a static one.
  if (!/\bimport\(\s*["']\.\/chunks\/more-pictures\.[^"']+\.mjs["']\s*\)/.test(lessonCode)) {
    fail('dist/lesson.mjs has no dynamic import("./chunks/more-pictures.…")');
  }
  if (helpFiles.some((f) => /[/\\]more-pictures\.[^/\\]+\.mjs$/.test(f))) {
    fail('dist/lesson.mjs reaches the pictures chunk through a static import');
  }
  if (helpFiles.some((f) => /[/\\]practice\.[^/\\]+\.mjs$/.test(f))) {
    fail('dist/lesson.mjs reaches the practice chunk through a static import');
  }
  if (helpFiles.some((f) => defines(readFileSync(f, 'utf8'), 'chocabloc-question'))) {
    fail('what Help loads statically registers <chocabloc-question>');
  }
  if (lazy) {
    // The practice chunk, or a chunk it imports statically, registers the question element and its choice pad.
    const practice = staticClosure(resolve(dist, lazy[1])).map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const tag of ['chocabloc-question', 'choca-choice-pad']) {
      if (!defines(practice, tag)) fail(`the practice chunk and its static imports do not register <${tag}>`);
    }
  }

  writeFileSync(resolve(tmpDir, 'entry.js'), `
    import { loadLesson, parseLesson } from '../dist/lesson.mjs';
    console.log(loadLesson, parseLesson);
  `);

  const result = await build({
    root: tmpDir,
    logLevel: 'silent',
    build: {
      write: true,
      outDir: resolve(tmpDir, 'out'),
      lib: { entry: resolve(tmpDir, 'entry.js'), formats: ['es'] },
      minify: false,
      rollupOptions: { external: [] },
    },
  });

  const outputs = Array.isArray(result) ? result : [result];
  const code = outputs
    .flatMap((r) => r.output)
    .map((o) => (o.type === 'chunk' ? o.code : ''))
    .join('\n');

  if (!code.includes("'unsupported-version'") && !code.includes('"unsupported-version"')) {
    fail('lesson consumer bundle does not contain the parser');
  }
  // The element registers itself as a side effect; a consumer that imports only
  // the parser must still get it (package.json sideEffects lists dist/lesson.mjs).
  if (!defines(code, 'chocabloc-lesson')) {
    fail('lesson consumer bundle does not register <chocabloc-lesson>');
  }
  // The practice chunk is reached only through the dynamic import; a consumer
  // bundler must keep its registrations (package.json sideEffects lists it).
  for (const tag of ['chocabloc-question', 'choca-choice-pad']) {
    if (!defines(code, tag)) fail(`lesson consumer bundle does not register <${tag}>`);
  }
  if (process.exitCode !== 1) {
    console.log(
      'PASS: lesson entry built, bundles the parser, registers <chocabloc-lesson>, and loads <chocabloc-question> only through the lazy practice chunk.',
    );
  }
} catch (e) {
  console.error('FAIL: lesson dist test threw', e);
  process.exitCode = 1;
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
