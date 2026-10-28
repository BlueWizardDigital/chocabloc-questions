// Choice sets that always show in one fixed order (fraction skills, Trello 427).
// A set is reordered only when every value belongs to a single list; any other
// set keeps the order it arrived in.
const FIXED_ORDERS: readonly (readonly string[])[] = [
  ['A', 'B', 'C', 'D', 'Same'],
  ['less than', 'equal to', 'greater than'],
  ['0', '1/2', '1'],
];

export function orderFixedChoiceSet(values: readonly string[]): string[] | null {
  if (values.length === 0) return null;
  const list = FIXED_ORDERS.find((l) => values.every((v) => l.includes(v)));
  if (!list) return null;
  return [...values].sort((a, b) => list.indexOf(a) - list.indexOf(b));
}
