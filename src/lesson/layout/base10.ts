import type { Base10Colors } from '../../elements/draw-base10';
import type { Place } from '../types';
import type { Msg } from '../messages';

export const PALE = '#eceff1';

export function base10Blocks(n: number): { thousands: number; hundreds: number; tens: number; ones: number } {
  return {
    thousands: Math.floor(n / 1000) % 10,
    hundreds: Math.floor(n / 100) % 10,
    tens: Math.floor(n / 10) % 10,
    ones: n % 10,
  };
}

const PLACES: Place[] = ['thousands', 'hundreds', 'tens', 'ones'];

/** "3 tens and 4 ones": places with 0 are skipped; 0 itself reads "0 ones". */
export function base10Caption(n: number, msg: Msg, lang: string): string {
  const blocks = base10Blocks(n);
  const parts = PLACES.filter((p) => blocks[p] > 0).map((p) => msg(`base10.${p}`, { count: blocks[p] }));
  if (parts.length === 0) return msg('base10.ones', { count: 0 });
  // Intl.ListFormat is Chrome 72, but the ES2019 lib has no type for it.
  const ListFormat = (Intl as unknown as { ListFormat: new (l: string, o: { type: string }) => { format(p: string[]): string } })
    .ListFormat;
  return new ListFormat(lang, { type: 'conjunction' }).format(parts);
}

/** The focused place keeps its default fill (undefined); the others turn pale. */
export function focusColors(focus?: Place): Base10Colors | undefined {
  if (focus == null) return undefined;
  const colors: Base10Colors = {};
  if (focus !== 'ones') colors.fillOnes = PALE;
  if (focus !== 'tens') colors.fillTens = PALE;
  if (focus !== 'hundreds') colors.fillHundreds = PALE;
  if (focus !== 'thousands') colors.fillThousands = PALE;
  return colors;
}
