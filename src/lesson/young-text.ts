import type { Msg } from './messages';

/** A step's `young` line with {a}, {b}, {c} as the picture's animals, plural unless their number is 1. A group the picture lacks reads "animals". */
export function fillYoung(text: string, animals: string[], counts: number[], msg: Msg): string {
  return text.replace(/\{([abc])\}/g, (_, k: string) => {
    const i = k.charCodeAt(0) - 97;
    const name = animals[i];
    return name ? msg(`animals.${name}`, { count: counts[i] }) : msg('young.allAnimals');
  });
}
