// Check: the host's questions one at a time, each with "I'm not sure yet".
// A check measures, so it never shows the answer.
import { checkDone } from '../flow';
import type { Outcome } from '../flow';
import type { LessonShell, PracticeController, PracticeHost } from './screens';
import { ask, prepare } from './question-view';
import type { Asking, Item } from './question-view';

export function startCheck(shell: LessonShell, host: PracticeHost): PracticeController {
  const { msg } = shell;
  let current: Asking | null = null;
  let disposed = false;
  let begun = false;
  const alive = (): boolean => !disposed && shell.active();

  const run = async (): Promise<void> => {
    // Read when the questions start, so a host may set them after `mode`.
    const validate = host.validateAnswer;
    const questions: unknown = host.questions;
    let items: Item[] = [];
    let problem: string | undefined;
    if (validate == null) {
      shell.emit('lesson-error', { reason: 'no-validator' });
      problem = msg('errors.noValidator');
    } else {
      if (Array.isArray(questions)) items = prepare(questions, new Set());
      else console.warn('[chocabloc-lesson] questions is not a list:', questions);
      if (items.length === 0) {
        shell.emit('lesson-error', { reason: 'no-questions' });
        problem = msg('errors.noQuestions');
      }
    }

    const answers: { skillId: string; outcome: Outcome }[] = [];
    for (const item of items) {
      const skillId = item.shown.skillIds[0] ?? '';
      const asking = ask({ shell, item, validate: validate!, step: 'check', skillId, heading: msg('steps.quickCheck') });
      current = asking;
      const outcome = await asking.done;
      asking.dispose();
      if (!alive()) return;
      answers.push({ skillId, outcome });
    }
    current = null;
    // `of` says how many were asked, so a short check can't lower placement.
    const detail = checkDone(answers);
    const text = msg('done.checkAll');
    // This is the end, so Close reports the result as Play does.
    const send = (): void => shell.done({ ...detail });
    shell.show({
      step: 'done',
      heading: text,
      say: text,
      feedback: problem,
      actions: [{ label: msg('play'), primary: true, run: send }],
      close: send,
    });
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
