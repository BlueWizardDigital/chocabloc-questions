import type { Msg } from './messages';

/** A step's `young` line with {a}, {b}, {c} as the picture's animals, plural unless their number is 1. Parse has already checked each placeholder has its group. */
export function fillYoung(text: string, animals: string[], counts: number[], msg: Msg): string {
  return text.replace(/\{([abc])\}/g, (_, k: string) => {
    const i = k.charCodeAt(0) - 97;
    return msg(`animals.${animals[i]}`, { count: counts[i] });
  });
}
