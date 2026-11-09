import en from './messages/en.json';
import { messagesFrom } from '../lesson/message-format';
import type { Msg, Translator } from '../lesson/message-format';

/** The English words help ships: every step line, each strategy's name and the panel's own words. */
export const helpMessagesEn: Record<string, unknown> = en;

/** The translator first, then English, then the key with one warning. */
export function createHelpMessages(opts: { translator?: Translator; lang: string }): Msg {
  return messagesFrom(helpMessagesEn, 'chocabloc-help', opts);
}
