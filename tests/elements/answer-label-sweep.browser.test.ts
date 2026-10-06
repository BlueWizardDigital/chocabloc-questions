// Answer-label sweep: every real row of every format whose picture draws text.
//
// format-conformance renders one row per format. A label that shows the
// answer only for some rows (a "find the missing leg" row among "find the
// hypotenuse" rows) slips past that. This file renders every row of
// mathSkills' generator output for those formats (tests/fixtures/
// answer-label-rows.json, built by scripts/fixtures/answer-label-rows.py), in
// two shapes:
//   - the generator row, with `answer` (as an assignment snapshot carries it);
//   - the bank's choices-only row: content filtered by the server's allow-list,
//     no `answer`.
// No text on the picture may equal the row's answer ("5" and "5.0" are the
// same), unless the question itself states that number: a given that happens
// to equal the answer (1 × 7 = 7) is not a giveaway. No label may read
// "undefined" or "NaN" either.
//
// Data graph and coordinate distance are not in the fixture: their axis
// numbers show values by design (PRINTS_ANSWER_BY_DESIGN in format-conformance).

import { expect } from '@esm-bundle/chai';
import '../../src/full';
import { normalizeQuestion } from '../../src/helpers/normalizer';
import type { NormalizedQuestion } from '../../src/types';

type FixtureRow = [skill: string, format: string, imageType: string | null,
  content: Record<string, unknown>, answer: unknown, given: string[]];

// Mirrors RENDER_CONTENT_KEYS in server-new services/recipeResolver.js: the
// only content keys a bank row keeps. Objects nest at most two levels deep.
const BANK_CONTENT_KEYS = new Set([
  'angle', 'attribute', 'classify_by', 'coins', 'components', 'concept', 'penny', 'nickel', 'dime',
  'quarter', 'loonie', 'toonie', 'diameter', 'dimension', 'dimensions', 'face_shape', 'find_type',
  'given_type', 'height', 'hypotenuse', 'known_angles', 'known_leg', 'legs', 'lines_of_symmetry', 'method',
  'missing_angle', 'operands', 'operation', 'part', 'pi_value', 'properties', 'property', 'prompt',
  'radius', 'relationship', 'shape', 'sides', 'slant', 'total', 'value',
]);

function bankValue(v: unknown, depth: number): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => bankValue(x, depth)).filter((x) => x !== undefined);
  return depth >= 2 ? undefined : bankContent(v as Record<string, unknown>, depth + 1);
}

function bankContent(c: Record<string, unknown>, depth = 1): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (!BANK_CONTENT_KEYS.has(k)) continue;
    const s = bankValue(v, depth);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

/* ---------- rendering ---------- */

type CanvasProto = { getContext: (...a: unknown[]) => unknown };

/** Collects every fillText / strokeText string while installed. */
function spyText(): { glyphs: string[]; restore: () => void } {
  const glyphs: string[] = [];
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
          if (prop === 'fillText' || prop === 'strokeText') glyphs.push(String(a[0]));
          return fn.apply(target, a);
        };
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  };
  return { glyphs, restore: () => { proto.getContext = orig; } };
}

/** All text the picture shows: canvas text, plus the number line's tick labels. */
function pictureText(q: NormalizedQuestion, glyphs: string[]): string[] {
  glyphs.length = 0;
  const el = document.createElement('chocabloc-question');
  el.setAttribute('answer-mode', 'mc');
  el.setAttribute('seed', '1');
  document.body.appendChild(el);
  try {
    (el as HTMLElement & { question: NormalizedQuestion }).question = q;
    const line = el.shadowRoot!.querySelector('choca-number-line-question');
    const ticks = line ? [...line.shadowRoot!.querySelectorAll('svg text')].map((t) => t.textContent ?? '') : [];
    return [...glyphs, ...ticks];
  } finally {
    el.remove();
  }
}

/* ---------- comparing ---------- */

/** Words and numbers in a label: "r=3" → r, 3; "base area=16" → base, area, 16; "129°" → 129. */
function tokens(text: string): string[] {
  return text.split(/[^0-9A-Za-z.-]+/).filter(Boolean);
}

const asNumber = (s: string): number | null => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null);

/** True when a token is the answer: equal as numbers ("5" = "5.0"), or as text. */
function isAnswer(token: string, answer: unknown): boolean {
  const a = String(answer);
  const ta = asNumber(token), aa = asNumber(a);
  if (ta !== null && aa !== null) return Math.abs(ta - aa) < 1e-9;
  return token.toLowerCase() === a.toLowerCase();
}

/* ---------- the sweep ---------- */

type Finding = { skill: string; shape: string; answer: unknown; text: string[]; problem: string };

function check(row: FixtureRow, shape: 'generator' | 'bank', text: string[]): Finding[] {
  const [skill, , , , answer, given] = row;
  const stated = (t: string) => given.some((g) => isAnswer(t, g));
  const found: Finding[] = [];
  const shown = text.filter((t) => tokens(t).some((tok) => isAnswer(tok, answer) && !stated(tok)));
  if (shown.length > 0) found.push({ skill, shape, answer, text, problem: `shows the answer: ${shown.join(' | ')}` });
  const broken = text.filter((t) => /undefined|NaN/.test(t));
  if (broken.length > 0) found.push({ skill, shape, answer, text, problem: `broken label: ${broken.join(' | ')}` });
  return found;
}

describe('answer-label sweep — every real row of every labelled format', function () {
  this.timeout(120000);

  let rows: FixtureRow[] = [];
  before(async () => {
    const res = await fetch(new URL('../fixtures/answer-label-rows.json', import.meta.url));
    rows = (await res.json()) as FixtureRow[];
  });

  it('the fixture holds every row (guards against an empty sweep)', () => {
    expect(rows.length).to.equal(3161);
  });

  for (const shape of ['generator', 'bank'] as const) {
    it(`no ${shape} row's picture shows its answer or a broken label`, () => {
      const spy = spyText();
      const findings: Finding[] = [];
      const labelledFormats = new Set<string>();
      const unrendered: string[] = [];
      try {
        rows.forEach((row, i) => {
          const [skill, format, imageType, content, answer] = row;
          const raw: Record<string, unknown> = shape === 'generator'
            ? {
              id: `${skill}-${i}`, skill_ids: [skill], format, image_type: imageType, content, answer,
              distractors: [{ value: `${String(answer)}0`, error_type: 'sweep' }],
            }
            : {
              id: `${skill}-${i}`, skillIds: [skill], format, imageType, content: bankContent(content),
              questionText: 'sweep', answerToken: 'test-token-not-real',
              choices: [{ value: String(answer) }, { value: `${String(answer)}0` }],
            };
          let q: NormalizedQuestion | null = null;
          try { q = normalizeQuestion(raw); } catch (err) { unrendered.push(`${skill} #${i}: ${String(err)}`); }
          if (!q) return;
          const text = pictureText(q, spy.glyphs);
          if (text.length > 0) labelledFormats.add(format);
          findings.push(...check(row, shape, text));
        });
      } finally {
        spy.restore();
      }

      // Every format in the fixture draws some text, or the sweep tested nothing.
      const formats = new Set(rows.map((r) => r[1]));
      const silent = [...formats].filter((f) => !labelledFormats.has(f));
      expect(silent, `formats that drew no text for any ${shape} row`).to.deep.equal([]);
      expect(unrendered, `${shape} rows that do not normalize`).to.deep.equal([]);

      const bySkill = new Map<string, Finding[]>();
      for (const f of findings) bySkill.set(f.skill, [...(bySkill.get(f.skill) ?? []), f]);
      const summary = [...bySkill].map(([skill, fs]) =>
        `${skill}: ${fs.length} rows, e.g. answer ${String(fs[0]!.answer)} — ${fs[0]!.problem}`);
      expect(summary, `${shape} rows whose picture gives the answer away or breaks`).to.deep.equal([]);
    });
  }
});
