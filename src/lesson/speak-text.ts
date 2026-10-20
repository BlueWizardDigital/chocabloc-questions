import type { Msg } from './messages';

/** Text for speech: math symbols become words, so a voice doesn't skip or mangle them. */
export function speakableText(text: string, msg: Msg): string {
  const word = (symbol: string): string => {
    switch (symbol) {
      case '<': return msg('symbols.lessThan');
      case '>': return msg('symbols.greaterThan');
      case '=': return msg('symbols.equals');
      case '+': return msg('symbols.plus');
      case '−': return msg('symbols.minus');
      case '×': return msg('symbols.times');
      case '÷': return msg('symbols.dividedBy');
      default: return msg('symbols.blank'); // ☐
    }
  };
  return text
    // shortcut: a digit-hyphen-digit also turns a date range ("1990-1995") into "minus", revisit if lessons carry dates.
    .replace(/(\d)\s*-\s*(?=\d)/g, (_m, d: string) => `${d} ${msg('symbols.minus')} `)
    .replace(/[<>=+−×÷☐]/g, (s) => ` ${word(s)} `)
    .replace(/\s+/g, ' ')
    .trim();
}
