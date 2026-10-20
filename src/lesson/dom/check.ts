// Check: the host's questions one at a time, each with "I'm not sure yet".
// A check measures, so it never shows the answer.
import { checkDone } from '../flow';
import type { Outcome } from '../flow';
import type { LessonShell, PracticeController, PracticeHost } from './screens';
import { ask, prepare } from './question-view';
import type { Asking } from './question-view';

export function startCheck(shell: LessonShell, host: PracticeHost): PracticeController {
  const { msg } = shell;
  const validate = host.validateAnswer;
  const items = validate ? prepare(host.questions, new Set()) : [];
  let problem: string | undefined;
  if (validate == null) {
    shell.emit('lesson-error', { reason: 'no-validator' });
    problem = msg('errors.noValidator');
  } else if (items.length === 0) {
    shell.emit('lesson-error', { reason: 'no-questions' });
    problem = msg('errors.noQuestions');
  }
  let current: Asking | null = null;
  let disposed = false;
  let begun = false;
  const alive = (): boolean => !disposed && shell.active();

  const run = async (): Promise<void> => {
    const answers: { skillId: string; outcome: Outcome }[] = [];
    for (const item of items) {
      const skillId = item.shown.skillIds[0] ?? '';
      current = ask({ shell, item, validate: validate!, step: 'check', skillId, heading: msg('steps.quickCheck') });
      const outcome = await current.done;
      if (!alive()) return;
      answers.push({ skillId, outcome });
    }
    current = null;
    // `of` says how many were asked, so a short check can't lower placement.
    const detail = checkDone(answers);
    const text = msg('done.checkAll');
    shell.show({
      step: 'done',
      heading: text,
      say: text,
      feedback: problem,
      actions: [{ label: msg('play'), primary: true, run: () => shell.done({ ...detail }) }],
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
