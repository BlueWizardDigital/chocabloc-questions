// Validate a word-problem dataset and print a static analysis.
// Run: npm run wp:validate            (uses vendored sample data)
//      npm run wp:validate -- t.json c.json
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { analyzeDataset } from '../../src/word-problems/validate';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../src/word-problems/data');
const templatesPath = process.argv[2] ?? resolve(dataDir, 'word_templates.json');
const contextPath = process.argv[3] ?? resolve(dataDir, 'context.json');

const rawTemplates = JSON.parse(readFileSync(templatesPath, 'utf8')) as Record<string, unknown>;
delete rawTemplates._meta;
const context = JSON.parse(readFileSync(contextPath, 'utf8'));

const report = analyzeDataset({ templates: rawTemplates, context }); // analyzeDataset accepts unknown
const withResult = report.skills.filter((s) => s.exposesResult);
const withUnknown = report.skills.filter((s) => s.unrecognizedPlaceholders.length);

console.log(`skills: ${report.total}`);
console.log(`templates exposing {result}: ${withResult.length}`);
console.log(`skills with unrecognized placeholders: ${withUnknown.length}`);
for (const s of withUnknown.slice(0, 20)) {
  console.log(`  ? ${s.skillId}: ${s.unrecognizedPlaceholders.join(', ')}`);
}
if (!report.ok) {
  console.error(`\n${report.errors.length} structural error(s):`);
  for (const e of report.errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('\nOK: no structural errors.');
