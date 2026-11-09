import en from './messages/en.json';
import { messagesFrom } from './message-format';
import type { Msg, Translator } from './message-format';

export { interpolate, isPluralForms, lookup, safeLang, selectMessage } from './message-format';
export type { Msg, Translator } from './message-format';

/** The English messages the library ships. */
export const lessonMessagesEn: Record<string, unknown> = en;

export function createMessages(opts: { translator?: Translator; lang: string }): Msg {
  return messagesFrom(lessonMessagesEn, 'chocabloc-lesson', opts);
}
