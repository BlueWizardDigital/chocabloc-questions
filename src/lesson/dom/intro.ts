// Intro after the idea: quick check, watch, your turn, and, when Your turn is
// failed, more examples and Try again on the easier skill. Fetches at most
// twice per run and never shows an id twice (spec corrections 1 and 3).
import { introDone, splitFirstBatch, stepVerdict } from '../flow';
import type { Outcome } from '../flow';
import type { NormalizedQuestion, ValidateAnswer } from '../../types';
import type { Lesson, LessonStep } from '../types';
import type { IntroStep, LessonShell, PracticeController, PracticeHost } from './screens';
import { ask, prepare } from './question-view';
import type { Asking, Item } from './question-view';

type ScoredStep = 'quickCheck' | 'yourTurn' | 'tryAgain';

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

  /** A fetch that failed: an empty batch, plus lesson-error (Review Focus 2). */
  const failed = (err: unknown): null => {
    console.warn('[chocabloc-lesson] getQuestions failed:', err);
    shell.emit('lesson-error', { reason: 'no-questions' });
    return null;
  };

  /** Up to `count` usable questions, from the host's getQuestions as it is now. */
  const fetchBatch = (skillId: string, count: number): Promise<Item[] | null> => {
    let call: Promise<unknown>;
    try {
      call = Promise.resolve(host.getQuestions!(skillId, count, [...seen]));
    } catch (err) {
      call = Promise.reject(err);
    }
    return call.then(
      (batch) =>
        Array.isArray(batch)
          ? prepare(batch as NormalizedQuestion[], seen)
          : failed(new TypeError(`getQuestions resolved to ${typeof batch}, not a list`)),
      failed,
    );
  };
  const fetchFirst = (): Promise<Item[] | null> => fetchBatch(lesson.skillId, lesson.quickCheck + pass.questions);
  // The first batch loads while the idea shows. With no validator yet, nothing
  // could be checked, so it waits until the questions start.
  let first = host.validateAnswer ? fetchFirst() : null;

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

  const askAll = async (
    items: Item[],
    validate: ValidateAnswer,
    step: ScoredStep,
    skillId: string,
    again = false,
  ): Promise<Outcome[]> => {
    const outcomes: Outcome[] = [];
    for (const item of items) {
      if (!alive()) break;
      seen.add(item.shown.id);
      const asking = ask({
        shell,
        item,
        validate,
        step,
        skillId,
        heading: msg(`steps.${step}`),
        chips: introChips(msg, lesson, step, again),
        afterWrong: lesson.afterWrong,
      });
      current = asking;
      outcomes.push(await asking.done);
      asking.dispose();
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
    // This is the end, so Close reports the result as Play does.
    const send = (): void => shell.done({ ...detail });
    shell.show({
      step: 'done',
      chips: introChips(msg, lesson, 'done', scored.tryAgain != null),
      heading: text,
      say: text,
      actions: [{ label: msg('play'), primary: true, run: send }],
      close: send,
    });
  };

  const run = async (): Promise<void> => {
    // Read when the questions start, so a host may set it after `mode`.
    const validate = host.validateAnswer;
    let batch: Item[] | null = null;
    if (validate == null) {
      shell.emit('lesson-error', { reason: 'no-validator' });
      shell.feedback(msg('errors.noValidator'));
    } else {
      if (first == null) first = fetchFirst();
      batch = await arrived(first);
      if (!alive()) return;
      if (batch == null) shell.feedback(msg('errors.noQuestions'));
    }
    const all = batch ?? [];
    const byShown = new Map(all.map((i) => [i.shown, i]));
    const split = splitFirstBatch(
      all.map((i) => i.shown),
      lesson.quickCheck,
      pass.questions,
    );
    const turn = split.yourTurn.map((q) => byShown.get(q)!);
    // A short Your turn decides nothing (correction 3). What did arrive plays as
    // the unscored quick check instead.
    const short = turn.length < pass.questions;
    const checkItems = short ? all.slice(0, lesson.quickCheck) : split.quickCheck.map((q) => byShown.get(q)!);

    const quickCheck = validate ? await askAll(checkItems, validate, 'quickCheck', lesson.skillId) : [];
    if (!alive()) return;
    await watch(lesson.example.steps, 'watch');
    if (!alive()) return;
    if (short || validate == null) {
      finish({ quickCheck, yourTurn: { available: turn.length, outcomes: [] } });
      return;
    }
    const turnOut = await askAll(turn, validate, 'yourTurn', lesson.skillId);
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
    const againOut = await askAll(again, validate, 'tryAgain', easier, true);
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
