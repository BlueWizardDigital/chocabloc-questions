// Intro after the idea: quick check, watch, your turn, and, when Your turn is
// failed, more examples and Try again on the easier skill. Fetches at most
// twice per run and never shows an id twice (spec corrections 1 and 3).
import { introDone, splitFirstBatch, stepVerdict } from '../flow';
import type { Outcome } from '../flow';
import type { Lesson, LessonStep } from '../types';
import type { IntroStep, LessonShell, PracticeController, PracticeHost } from './screens';
import { ask, prepare } from './question-view';
import type { AnswerStep, Asking, Item } from './question-view';

export function startIntro(shell: LessonShell, lesson: Lesson, host: PracticeHost): PracticeController {
  const { msg } = shell;
  const { introChips, walkSteps } = shell.kit;
  const { pass } = lesson;
  /** Every id shown in this run, in the order shown. */
  const seen = new Set<string>();
  let current: Asking | null = null;
  let disposed = false;
  let begun = false;
  const alive = (): boolean => !disposed && shell.active();

  /** Up to `count` usable questions; a rejection is an empty batch plus lesson-error (Review Focus 2). */
  const fetchBatch = (skillId: string, count: number): Promise<Item[] | null> => {
    let call: Promise<unknown>;
    try {
      call = Promise.resolve(host.getQuestions!(skillId, count, [...seen]));
    } catch (err) {
      call = Promise.reject(err);
    }
    return call.then(
      (batch) => prepare(batch, seen),
      (err: unknown) => {
        console.warn('[chocabloc-lesson] getQuestions failed:', err);
        shell.emit('lesson-error', { reason: 'no-questions' });
        return null;
      },
    );
  };

  const validate = host.validateAnswer;
  // Without a validator no question can be checked, so none is fetched or shown.
  if (validate == null) shell.emit('lesson-error', { reason: 'no-validator' });
  const first = validate ? fetchBatch(lesson.skillId, lesson.quickCheck + pass.questions) : Promise.resolve(null);

  /** Waits for a batch, saying "Getting your questions…" if it isn't here yet. */
  const arrived = async (batch: Promise<Item[] | null>): Promise<Item[] | null> => {
    let here = false;
    void batch.then(() => (here = true));
    await Promise.resolve();
    if (!here && alive()) {
      const text = msg('gettingQuestions');
      shell.show({ step: 'loading', heading: text, say: text, actions: [] });
    }
    return batch;
  };

  const askAll = async (items: Item[], step: AnswerStep, at: IntroStep, skillId: string, again = false) => {
    const outcomes: Outcome[] = [];
    for (const item of items) {
      if (!alive()) break;
      seen.add(item.shown.id);
      current = ask({
        shell,
        item,
        validate: validate!,
        step,
        skillId,
        heading: msg(`steps.${at}`),
        chips: introChips(msg, lesson, at, again),
        afterWrong: lesson.afterWrong,
      });
      outcomes.push(await current.done);
    }
    current = null;
    return outcomes;
  };

  const watch = (steps: LessonStep[], at: IntroStep, again = false): Promise<void> =>
    new Promise((resolve) =>
      walkSteps(shell, steps, introChips(msg, lesson, at, again), at, { label: msg('next'), primary: true, run: resolve }),
    );

  const finish = (scored: Parameters<typeof introDone>[1]): void => {
    if (!alive()) return;
    const detail = introDone(lesson, scored);
    const text =
      detail.outcome === 'passed'
        ? msg('done.passed')
        : detail.outcome === 'passedEasier'
          ? msg('done.passedEasier', { title: lesson.moreHelp.title })
          : detail.outcome === 'notYet'
            ? msg('done.notYet')
            : msg('done.incomplete');
    shell.show({
      step: 'done',
      chips: introChips(msg, lesson, 'done', scored.tryAgain != null),
      heading: text,
      say: text,
      actions: [{ label: msg('play'), primary: true, run: () => shell.done({ ...detail }) }],
    });
  };

  const run = async (): Promise<void> => {
    const batch = await arrived(first);
    if (!alive()) return;
    if (batch == null) shell.feedback(validate ? msg('errors.noQuestions') : msg('errors.noValidator'));
    const split = splitFirstBatch(
      (batch ?? []).map((i) => i.shown),
      lesson.quickCheck,
      pass.questions,
    );
    const byShown = new Map((batch ?? []).map((i) => [i.shown, i]));
    const items = (qs: typeof split.quickCheck): Item[] => qs.map((q) => byShown.get(q)!);

    const quickCheck = await askAll(items(split.quickCheck), 'quickCheck', 'quickCheck', lesson.skillId);
    if (!alive()) return;
    await watch(lesson.example.steps, 'watch');
    if (!alive()) return;
    const turn = items(split.yourTurn);
    // A short Your turn decides nothing (correction 3).
    if (turn.length < pass.questions) {
      finish({ quickCheck, yourTurn: { available: turn.length, outcomes: [] } });
      return;
    }
    const turnOut = await askAll(turn, 'yourTurn', 'yourTurn', lesson.skillId);
    if (!alive()) return;
    const yourTurn = { available: turn.length, outcomes: turnOut };
    if (stepVerdict(turn.length, turnOut, pass) === 'passed') {
      finish({ quickCheck, yourTurn });
      return;
    }

    // Your turn was failed in full: Try again's batch loads during the more examples.
    const easier = lesson.moreHelp.skillId;
    const next = fetchBatch(easier, pass.questions);
    for (const ex of lesson.moreHelp.examples) {
      await watch(ex.steps, 'moreExamples', true);
      if (!alive()) return;
    }
    const againBatch = await arrived(next);
    if (!alive()) return;
    if (againBatch == null) shell.feedback(msg('errors.noQuestions'));
    const again = (againBatch ?? []).slice(0, pass.questions);
    if (again.length < pass.questions) {
      finish({ quickCheck, yourTurn, tryAgain: { available: again.length, outcomes: [] } });
      return;
    }
    const againOut = await askAll(again, 'tryAgain', 'tryAgain', easier, true);
    finish({ quickCheck, yourTurn, tryAgain: { available: again.length, outcomes: againOut } });
  };

  return {
    begin() {
      if (begun || !alive()) return;
      begun = true;
      void run();
    },
    dispose() {
      disposed = true;
      current?.dispose();
    },
  };
}
