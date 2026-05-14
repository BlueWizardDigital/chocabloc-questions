import type {
  AnswerValue,
  CADCoinName,
  Currency,
  QuestionFormat,
  USDCoinName,
} from '../types';

export type CurrencyFormatOptions = {
  currency?: Currency;
  locale?: string;
};

export function formatCurrency(cents: number, opts: CurrencyFormatOptions = {}): string {
  const currency = opts.currency ?? 'USD';
  const locale = opts.locale ?? 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

// Pedagogical money formatting convention (CCSS 2.MD.C.8 + 4.NF.C.6 aligned):
//   Sub-dollar amounts use cent symbol form (`45¢`) — matches real coin/price-
//     tag notation early-grade learners encounter, requires no decimal place
//     value understanding.
//   Dollar-plus amounts use decimal form (`$1.25`) — cent form past 100¢ is
//     incorrect notation (`125¢` is not how money is written) and by that
//     stage decimal place value is being taught anyway.
export function formatAnswerForDisplay(
  answer: AnswerValue,
  format: QuestionFormat,
  opts: CurrencyFormatOptions = {},
): string {
  if (format === 'money' && typeof answer === 'number') {
    if (answer >= 0 && answer < 100) return `${answer}¢`;
    return formatCurrency(answer, opts);
  }
  if (Array.isArray(answer) && answer.length === 2) {
    return `(${answer[0]}, ${answer[1]})`;
  }
  return String(answer);
}

const USD_ORDER: readonly USDCoinName[] = ['quarter', 'dime', 'nickel', 'penny'];
const CAD_ORDER: readonly CADCoinName[] = ['toonie', 'loonie', 'quarter', 'dime', 'nickel'];

const COIN_LABELS: Readonly<Record<USDCoinName | CADCoinName, { one: string; many: string }>> = {
  penny: { one: 'penny', many: 'pennies' },
  nickel: { one: 'nickel', many: 'nickels' },
  dime: { one: 'dime', many: 'dimes' },
  quarter: { one: 'quarter', many: 'quarters' },
  loonie: { one: 'loonie', many: 'loonies' },
  toonie: { one: 'toonie', many: 'toonies' },
};

export function formatCoinCountForScreenReader(
  coins: Partial<Record<USDCoinName | CADCoinName, number>>,
  currency: Currency,
): string {
  const order = currency === 'USD' ? USD_ORDER : CAD_ORDER;
  const parts: string[] = [];
  for (const key of order) {
    const count = coins[key];
    if (typeof count !== 'number' || count <= 0) continue;
    const labels = COIN_LABELS[key];
    parts.push(`${count} ${count === 1 ? labels.one : labels.many}`);
  }
  return parts.join(', ');
}
