// Render-twice contract against the server's content map (Trello 360).
//
// The server sends a bank row's `content` trimmed by CONTENT_BY_FORMAT
// (server-new services/renderContent.js), the fields each format's picture
// reads and nothing else. If an entry misses a field a renderer reads, the
// picture silently changes between "the generator's whole row" and "what the
// wire carries". If a renderer reads a withheld field (an answer), the same.
//
// For every row from three sources (the answer-label sweep, the conformance
// representatives, and the server's real-row fixture, which covers every
// format) this renders the bank-shaped question twice, content whole and
// content trimmed by a port of the server's pick(), and records
//   - every canvas call (method + arguments, numbers rounded to 1 decimal), and
//   - the picture's DOM text: every shadow root's text, choice pad removed
//     (the table, pattern, coin pile, number line and the stem draw DOM).
// The two recordings must be identical unless the format is in
// NO_PICTURE_BY_DESIGN. A format with no entry in the server map fails.
//
// tests/fixtures/server-content-by-format.json is the map, copied from the
// server (see its `_source`); re-copy it when the server's map changes.

import { expect } from '@esm-bundle/chai';
import '../../src/full';
import { normalizeQuestion } from '../../src/helpers/normalizer';
import type { NormalizedQuestion } from '../../src/types';
import { NO_PICTURE_BY_DESIGN, REPRESENTATIVE_ROWS, stemRow } from './support/conformance-rows';

/* ---------- a port of the server's pick() ---------- */

type Spec = ReadonlyArray<string | Record<string, unknown>>;
type Obj = Record<string, unknown>;

const has = (o: Obj, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isPrimitive = (v: unknown): boolean =>
  v === null || ['string', 'number', 'boolean'].includes(typeof v);
const isPlainObject = (v: unknown): v is Obj =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_ARRAY_NESTING = 2;

function copyPrimitiveArray(v: unknown, depth = 1): unknown[] | undefined {
  if (!Array.isArray(v) || depth > MAX_ARRAY_NESTING) return undefined;
  const out: unknown[] = [];
  for (const x of v) {
    if (isPrimitive(x)) { out.push(x); continue; }
    const inner = copyPrimitiveArray(x, depth + 1);
    if (inner === undefined) return undefined;
    out.push(inner);
  }
  return out;
}

function pickMap(v: unknown): Obj {
  const out: Obj = {};
  if (!isPlainObject(v)) return out;
  for (const k of Object.keys(v)) if (!UNSAFE_KEYS.has(k) && isPrimitive(v[k])) out[k] = v[k];
  return out;
}

function pick(raw: unknown, spec: Spec): Obj {
  const out: Obj = {};
  if (!isPlainObject(raw)) return out;
  for (const entry of spec) {
    if (typeof entry === 'string') {
      if (!has(raw, entry)) continue;
      const v = raw[entry];
      if (isPrimitive(v)) { out[entry] = v; continue; }
      const arr = copyPrimitiveArray(v);
      if (arr !== undefined) out[entry] = arr;
      continue;
    }
    const [key, nested] = Object.entries(entry)[0]!;
    if (!has(raw, key)) continue;
    const v = raw[key];
    if (nested === '*') { out[key] = pickMap(v); continue; }
    if (Array.isArray(v)) out[key] = v.filter(isPlainObject).map((o) => pick(o, nested as Spec));
    else if (isPlainObject(v)) out[key] = pick(v, nested as Spec);
  }
  return out;
}

/* ---------- recording ---------- */

type CanvasProto = { getContext: (...a: unknown[]) => unknown };

const round = (a: unknown): string =>
  typeof a === 'number' ? String(Math.round(a * 10) / 10) : String(a);

/** Every canvas method call as "name(arg,arg)" while installed. */
function spyCalls(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const proto = HTMLCanvasElement.prototype as unknown as CanvasProto;
  const orig = proto.getContext;
  proto.getContext = function (this: HTMLCanvasElement, ...args: unknown[]): unknown {
    const ctx = orig.apply(this, args) as CanvasRenderingContext2D | null;
    if (args[0] !== '2d' || !ctx) return ctx;
    return new Proxy(ctx, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target) as unknown;
        if (typeof value !== 'function') return value;
        const fn = value as (...a: unknown[]) => unknown;
        return (...a: unknown[]): unknown => {
          calls.push(`${String(prop)}(${a.map(round).join(',')})`);
          return fn.apply(target, a);
        };
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  };
  return { calls, restore: () => { proto.getContext = orig; } };
}

/** All text under a node, through every shadow root, skipping the choice pad and styles. */
function domText(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.textContent ?? '').trim();
    if (t) out.push(t);
    return;
  }
  if (node instanceof Element) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'choca-choice-pad' || tag === 'style' || tag === 'script') return;
    if (node.shadowRoot) domText(node.shadowRoot, out);
  }
  for (const child of Array.from(node.childNodes)) domText(child, out);
}

function record(q: NormalizedQuestion, spy: { calls: string[] }): string {
  spy.calls.length = 0;
  const el = document.createElement('chocabloc-question');
  el.setAttribute('answer-mode', 'mc');
  el.setAttribute('seed', '1');
  document.body.appendChild(el);
  try {
    (el as HTMLElement & { question: NormalizedQuestion }).question = q;
    const text: string[] = [];
    domText(el.shadowRoot!, text);
    return JSON.stringify({ canvas: [...spy.calls], text });
  } finally {
    el.remove();
  }
}

/* ---------- the rows ---------- */

// Dispatch formats the bank never serves, so the server map has no entry for
// them: `text` ships its own stem, `money` and `base10_blocks` are legacy
// assignment-only shapes. A format outside this list and outside the map fails.
const NOT_ON_THE_BANK = new Set(['text', 'money', 'base10_blocks']);

type ContractRow = { source: string; label: string; format: string; skill: string; imageType: string | null;
  content: Obj; answer: unknown; questionText: string };

type SweepRow = [skill: string, format: string, imageType: string | null, content: Obj, answer: unknown, given: string[]];
type BankRow = { question_id: string; skill_id: string; format: string; content: Obj; answer: unknown };

function bankShaped(r: ContractRow, content: Obj): Record<string, unknown> {
  const a = String(r.answer);
  return {
    id: r.label, skillIds: [r.skill], format: r.format, imageType: r.imageType, content,
    questionText: r.questionText, answerToken: 'test-token-not-real',
    choices: [{ value: a }, { value: 'x1' }, { value: 'x2' }, { value: 'x3' }],
  };
}

async function load<T>(name: string): Promise<T> {
  const res = await fetch(new URL(`../fixtures/${name}`, import.meta.url));
  return (await res.json()) as T;
}

describe('server content map contract: whole and trimmed rows render identically', function () {
  this.timeout(600000);

  let map: Record<string, Spec> = {};
  const rows: ContractRow[] = [];
  const counts: Record<string, number> = {};

  before(async () => {
    map = (await load<{ CONTENT_BY_FORMAT: Record<string, Spec> }>('server-content-by-format.json')).CONTENT_BY_FORMAT;

    (await load<SweepRow[]>('answer-label-rows.json')).forEach(([skill, format, imageType, content, answer], i) => {
      rows.push({ source: 'sweep', label: `${skill}#${i}`, format, skill, imageType, content, answer, questionText: 'sweep' });
    });

    for (const [format, entry] of Object.entries(REPRESENTATIVE_ROWS)) {
      for (const [i, r] of (Array.isArray(entry) ? entry : [entry]).entries()) {
        rows.push({
          source: 'conformance', label: `${format}[${i}]`, format,
          skill: String((r['skillIds'] as string[])[0]), imageType: (r['imageType'] as string | undefined) ?? null,
          content: r['content'] as Obj, answer: r['answer'], questionText: String(r['questionText'] ?? ''),
        });
      }
    }
    // A format with no representative falls back to stemRow, as format-conformance does.
    for (const format of Object.keys(map)) {
      if (REPRESENTATIVE_ROWS[format]) continue;
      const r = stemRow(format);
      rows.push({
        source: 'conformance', label: `${format}[stem]`, format, skill: `${format.toUpperCase()}-SKILL`,
        imageType: null, content: r['content'] as Obj, answer: r['answer'], questionText: String(r['questionText']),
      });
    }

    for (const b of await load<BankRow[]>('bank-content-sample.json')) {
      rows.push({
        source: 'bank', label: b.question_id, format: b.format, skill: b.skill_id, imageType: null,
        content: b.content, answer: b.answer, questionText: '',
      });
    }
    for (const r of rows) counts[r.source] = (counts[r.source] ?? 0) + 1;
  });

  it('the three sources are loaded (guards against an empty run)', () => {
    expect(counts['sweep']).to.equal(3161);
    expect(counts['bank']).to.equal(962);
    expect(counts['conformance']).to.be.greaterThan(90);
    expect(new Set(rows.filter((r) => r.source === 'bank').map((r) => r.format)).size).to.equal(99);
  });

  it('every format a row uses has an entry in the server map', () => {
    const missing = [...new Set(rows.map((r) => r.format))]
      .filter((f) => !has(map, f) && !NOT_ON_THE_BANK.has(f)).sort();
    expect(missing, 'formats with no CONTENT_BY_FORMAT entry (the server would send content: {})').to.deep.equal([]);
  });

  it('every format in the server map has a real row in the bank fixture', () => {
    const seen = new Set(rows.filter((r) => r.source === 'bank').map((r) => r.format));
    expect(Object.keys(map).filter((f) => !seen.has(f))).to.deep.equal([]);
  });

  it('every row renders the same with its content whole and trimmed, except no-picture formats', () => {
    const spy = spyCalls();
    const diffs = new Map<string, { n: number; example: string }>();
    const unrendered: string[] = [];
    const perFormat: Record<string, number> = {};
    const recorded = new Set<string>();
    try {
      for (const r of rows) {
        if (!has(map, r.format)) continue; // NOT_ON_THE_BANK, checked above
        const whole = bankShaped(r, r.content);
        const trimmed = bankShaped(r, pick(r.content, map[r.format]!));
        let qa: NormalizedQuestion | null = null;
        let qb: NormalizedQuestion | null = null;
        try { qa = normalizeQuestion(whole); qb = normalizeQuestion(trimmed); } catch (err) {
          unrendered.push(`${r.source} ${r.label} (${r.format}): ${String(err)}`);
          continue;
        }
        if (!qa || !qb) { unrendered.push(`${r.source} ${r.label} (${r.format}): normalized to null`); continue; }
        perFormat[r.format] = (perFormat[r.format] ?? 0) + 1;
        if (NO_PICTURE_BY_DESIGN[r.format]) continue;
        const a = record(qa, spy);
        const b = record(qb, spy);
        if (a.includes('"canvas":["') || !a.includes('"text":[]')) recorded.add(r.format);
        if (a !== b) {
          const key = `${r.format}`;
          const prev = diffs.get(key);
          if (prev) prev.n += 1;
          else diffs.set(key, { n: 1, example: `${r.source} ${r.label}\n  whole:   ${a.slice(0, 600)}\n  trimmed: ${b.slice(0, 600)}` });
        }
      }
    } finally {
      spy.restore();
    }
    expect(unrendered.slice(0, 20), `rows that do not normalize (${unrendered.length})`).to.deep.equal([]);
    expect(
      [...diffs].map(([f, d]) => `${f}: ${d.n} rows differ, e.g. ${d.example}`),
      'formats whose picture changes when the server trims the content',
    ).to.deep.equal([]);
    const empty = Object.keys(perFormat).filter((f) => !NO_PICTURE_BY_DESIGN[f] && !recorded.has(f)).sort();
    expect(empty, 'formats with no canvas call and no DOM text for any row (an empty recording proves nothing)')
      .to.deep.equal([]);
    // eslint-disable-next-line no-console
    console.log(`contract: ${JSON.stringify(counts)}; formats rendered ${Object.keys(perFormat).length}`);
  });
});
