// The share picture's layout. Only the lazy pictures chunk imports this file, so it imports nothing
// Help loads: a module both load would make Rollup pull Help into a shared chunk behind a facade.

/** The parts of the quotient, one per non-zero digit, biggest place first: 59 / 4 gives [10, 4]. */
export function shareParts(total: number, rows: number): number[] {
  const q = Math.floor(total / rows);
  return [q - (q % 10), q % 10].filter((n) => n > 0);
}

export type Tone = 0 | 1 | 'left' | null; // part index, the remainder, or plain ink
export interface LdCell {
  text: string;
  tone: Tone;
}
export type LdNote =
  | { key: 'ldTens'; count: number; value: number } // "4 tens = 40"
  | { key: 'ldLeft'; count: number } // "19 left"
  | { key: 'ldTimes'; a: number; b: number }; // "4 × 4"
export interface LdLine {
  kind: 'quotient' | 'dividend' | 'product' | 'rule' | 'difference';
  cells: LdCell[]; // always 4: [sign or divisor, tens, ones, remainder slot]
  note?: LdNote;
}

const COLS = 4;
const blank = (): LdCell[] => Array.from({ length: COLS }, () => ({ text: '', tone: null }));

/** Write `text` right-aligned so its last character lands in column `end`. */
function put(cells: LdCell[], text: string, end: number, tone: Tone): void {
  for (let k = 0; k < text.length; k++) {
    const col = end - text.length + 1 + k;
    if (col >= 1) cells[col] = { text: text.charAt(k), tone };
  }
}

function line(kind: LdLine['kind'], cells: LdCell[], note?: LdNote): LdLine {
  return note ? { kind, cells, note } : { kind, cells };
}

export function longDivision(total: number, rows: number, shown: number, left: boolean): LdLine[] {
  const parts = shareParts(total, rows);
  const rem = total % rows;
  const out: LdLine[] = [];

  const quotient = blank();
  parts.forEach((p, i) => {
    if (i >= shown) return;
    // Two parts: the tens digit sits over the tens column, the ones digit over the ones.
    const col = parts.length === 2 && i === 0 ? 1 : 2;
    quotient[col] = { text: String(p >= 10 ? p / 10 : p), tone: i === 0 ? 0 : 1 };
  });
  if (left && shown === parts.length && rem > 0) quotient[3] = { text: `R${rem}`, tone: 'left' };
  out.push(line('quotient', quotient));

  const dividend = blank();
  dividend[0] = { text: String(rows), tone: null };
  put(dividend, String(total), 2, null);
  out.push(line('dividend', dividend));

  let running = total;
  for (let i = 0; i < Math.min(shown, parts.length); i++) {
    const part = parts[i] ?? 0;
    const tone: Tone = i === 0 ? 0 : 1;
    const isTens = part >= 10;
    const product = part * rows;
    const productCells = Array.from({ length: COLS }, () => ({ text: '', tone }));
    productCells[0] = { text: '−', tone };
    // A tens product sits under the tens column; a ones product under the ones.
    const productText = String(isTens ? product / 10 : product);
    put(productCells, productText, isTens ? 1 : 2, tone);
    out.push(
      line(
        'product',
        productCells,
        isTens ? { key: 'ldTens', count: product / 10, value: product } : { key: 'ldTimes', a: rows, b: part },
      ),
    );

    const rule = blank();
    for (let c = 1; c < COLS; c++) if (productCells[c]?.text) rule[c] = { text: '─', tone: null };
    out.push(line('rule', rule));

    running -= product;
    const last = i === parts.length - 1;
    const diffTone: Tone = last && left && rem > 0 ? 'left' : null;
    const diff = blank();
    put(diff, String(running), 2, diffTone);
    out.push(line('difference', diff, last ? undefined : { key: 'ldLeft', count: running }));
  }
  return out;
}

/** Per row, the dots in order: a part index for a given dot, 'spot' for one not given yet. */
export function shareRow(total: number, rows: number, shown: number): (number | 'spot')[] {
  const dots: (number | 'spot')[] = [];
  shareParts(total, rows).forEach((p, i) => {
    for (let k = 0; k < p; k++) dots.push(i < shown ? i : 'spot');
  });
  return dots;
}
