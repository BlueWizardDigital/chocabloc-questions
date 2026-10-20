import { parseLesson, parseLessonIndex } from './parse';
import type { Lesson, LessonIndex, LessonLoadFailure } from './types';

type Fetched = { ok: true; json: unknown } | { ok: false; reason: LessonLoadFailure };

async function fetchJson(url: string): Promise<Fetched> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (res.status === 404) return { ok: false, reason: 'not-found' };
  if (!res.ok) return { ok: false, reason: 'network' };
  try {
    return { ok: true, json: await res.json() };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

export async function loadLesson(
  url: string,
): Promise<{ ok: true; lesson: Lesson } | { ok: false; reason: LessonLoadFailure }> {
  const got = await fetchJson(url);
  if (!got.ok) return got;
  return parseLesson(got.json);
}

export async function loadLessonIndex(
  url: string,
): Promise<{ ok: true; index: LessonIndex } | { ok: false; reason: LessonLoadFailure }> {
  const got = await fetchJson(url);
  if (!got.ok) return got;
  return parseLessonIndex(got.json);
}
