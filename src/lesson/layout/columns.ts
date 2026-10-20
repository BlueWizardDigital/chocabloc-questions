import type { LessonPicture } from '../types';

type Columns = Extract<LessonPicture, { kind: 'columns' }>;
type Row = { cells: string[]; role: 'carry' | 'number' | 'result' };

const split = (s: string): [string, string | null] => {
  const i = s.indexOf('.');
  return i < 0 ? [s, null] : [s.slice(0, i), s.slice(i + 1)];
};

export function columnsLayout(pic: Columns): { width: number; rows: Row[]; opColumn: boolean } {
  const opColumn = pic.op !== 'compare';
  const texts = pic.numbers.map(String);
  const result = pic.result != null ? String(pic.result) : undefined;
  const aligned = result != null ? [...texts, result] : texts;

  let intLen = 0;
  let fracLen = 0;
  let decimal = false;
  for (const t of aligned) {
    const [i, f] = split(t);
    intLen = Math.max(intLen, i.length);
    if (f != null) {
      decimal = true;
      fracLen = Math.max(fracLen, f.length);
    }
  }
  const digits = intLen + (decimal ? 1 + fracLen : 0);
  const carry = pic.carry != null ? Array.from(pic.carry) : undefined;
  const body = Math.max(digits, carry ? carry.length : 0);
  const lead = opColumn ? 1 : 0;
  const width = lead + body;

  const place = (t: string): string[] => {
    const [i, f] = split(t);
    const cells = new Array<string>(body).fill('');
    const start = body - digits;
    for (let k = 0; k < i.length; k++) cells[start + intLen - i.length + k] = i.charAt(k);
    if (f != null) {
      cells[start + intLen] = '.';
      for (let k = 0; k < f.length; k++) cells[start + intLen + 1 + k] = f.charAt(k);
    }
    return cells;
  };
  const withLead = (cells: string[], op = ''): string[] => (opColumn ? [op, ...cells] : cells);

  const rows: Row[] = [];
  if (carry) {
    const cells = new Array<string>(body).fill('');
    carry.forEach((c, k) => {
      cells[body - carry.length + k] = c === ' ' ? '' : c;
    });
    rows.push({ cells: withLead(cells), role: 'carry' });
  }
  texts.forEach((t, k) => rows.push({ cells: withLead(place(t), k === 1 ? pic.op : ''), role: 'number' }));
  if (result != null) rows.push({ cells: withLead(place(result)), role: 'result' });
  return { width, rows, opColumn };
}
