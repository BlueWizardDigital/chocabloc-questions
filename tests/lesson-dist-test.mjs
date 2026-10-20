/**
 * Lesson entry verification script.
 * Checks the built lesson entry exists, and that a consumer bundle importing
 * it carries the parser.
 *
 * Run after `npm run build`: node tests/lesson-dist-test.mjs
 */
import { build } from 'vite';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpDir = resolve(__dirname, '../.lesson-dist-tmp');

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

try {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  for (const f of ['../dist/lesson.mjs', '../dist/lesson/index.d.ts']) {
    if (!existsSync(resolve(__dirname, f))) fail(`${f.slice(3)} is missing`);
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
  if (process.exitCode !== 1) console.log('PASS: lesson entry built and bundles the parser.');
} catch (e) {
  console.error('FAIL: lesson dist test threw', e);
  process.exitCode = 1;
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
