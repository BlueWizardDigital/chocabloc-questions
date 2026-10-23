const GRADES = ['K', '1', '2', '3', '4', '5', '6'];
const YOUNG = ['K', '1', '2', '3'];

/** A kid's grade as the player takes it: 'K' or '1' to '6'. Anything else is null, with a warning. */
export function normalizeGrade(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string' && GRADES.includes(v)) return v;
  console.warn(`[chocabloc-lesson] unknown grade: ${String(v)}`);
  return null;
}

/** K to 3 get the young look. The kid's grade decides; with none, the skill's own grade does. */
export function lookFor(grade: unknown, skillGrade: unknown): 'young' | 'standard' {
  const g = normalizeGrade(grade) ?? (typeof skillGrade === 'string' ? skillGrade : null);
  return g !== null && YOUNG.includes(g) ? 'young' : 'standard';
}
