/** Eight of the twenty sign-in drawings: clear at 30 px, and no two alike in colour (the other twelve look too close to these). */
export const LESSON_ANIMALS: readonly string[] = ['cat', 'crab', 'dog', 'duck', 'fish', 'frog', 'pig', 'zebra'];

/** n distinct animals for a skill, the same every time. Fewer is always a prefix of more. */
export function pickAnimals(skillId: string, n: 1 | 2 | 3): string[] {
  let x = 2166136261;
  for (let i = 0; i < skillId.length; i++) x = Math.imul(x ^ skillId.charCodeAt(i), 16777619) >>> 0;
  // An odd step is coprime with 8, so n steps never land twice.
  const step = 2 * ((x >>> 8) % 4) + 1;
  return Array.from({ length: n }, (_, k) => LESSON_ANIMALS[((x % 8) + k * step) % 8]!);
}
