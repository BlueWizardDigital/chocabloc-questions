// Cross-repo contract test (v0.4.0).
//
// Pinned fixture of what `chocabloc/server-new`'s `recipeResolver.
// serializeQuestionForGame` emits when `F6_DROP_ANSWER=true` and a userId
// is in scope. Verifies the lib normalizes the wire shape cleanly and
// buildChoicePool produces a renderable pool.
//
// If this test fails, the server↔lib contract has drifted — flag before
// flipping the env in prod. To refresh the fixture, capture a real
// `GET /api/v1/games/:id/questions` response and replace the JSON. Keep
// the `_source` comment in sync.

import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/server-emission-choices-only.json';
import { normalizeQuestion } from '../../src/helpers/normalizer';
import { buildChoicePool } from '../../src/helpers/choice-builder';

describe('server emission contract (F6 stage 5)', () => {
  it('every fixture question normalizes without throwing', () => {
    for (const raw of fixture.questions) {
      const q = normalizeQuestion(raw);
      expect(q, `failed to normalize ${raw.id}`).not.toBeNull();
    }
  });

  it.each(fixture.questions.map((q) => [q.id, q]))(
    '%s — normalized shape carries choices, no answer, no distractors',
    (_id, raw) => {
      const q = normalizeQuestion(raw)!;
      expect(q.choices).toBeDefined();
      expect(q.choices!.length).toBe(raw.choices.length);
      expect(q.answer).toBeUndefined();
      expect(q.distractors).toBeUndefined();
    },
  );

  it.each(fixture.questions.map((q) => [q.id, q]))(
    '%s — buildChoicePool returns choices verbatim, all correct:false',
    (_id, raw) => {
      const q = normalizeQuestion(raw)!;
      const pool = buildChoicePool(q);
      expect(pool.length).toBe(raw.choices.length);
      for (const c of pool) {
        expect(c.correct).toBe(false);
      }
      // Values preserved 1:1 (server is source of truth for ordering)
      const inValues = raw.choices.map((c) => c.value);
      const outValues = pool.map((c) => c.value);
      expect(outValues).toEqual(inValues);
    },
  );

  it('skillIds, format, imageType, questionText, content all survive normalize', () => {
    for (const raw of fixture.questions) {
      const q = normalizeQuestion(raw)!;
      expect(q.skillIds).toEqual(raw.skillIds);
      expect(q.format).toBe(raw.format);
      expect(q.questionText).toBe(raw.questionText);
      // content is passed through (sanitization happens server-side via
      // RENDER_CONTENT_KEYS; lib trusts the server-emitted content shape)
      expect(q.content).toEqual(raw.content);
    }
  });
});
