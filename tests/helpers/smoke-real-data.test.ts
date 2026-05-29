import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeBatch } from '../../src/helpers/normalizer';
import type { MalformedRowReport } from '../../src/helpers/normalizer';
import * as env from '../../src/internal/env';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('Smoke test: real question bank', () => {
  beforeEach(() => {
    vi.spyOn(env, 'isProd').mockReturnValue(true);
  });

  const qDir = join(__dirname, '../../../../public/data/questions/questions');
  let allFiles: string[] = [];
  try {
    allFiles = readdirSync(qDir).filter((f) => f.endsWith('.json'));
  } catch {
    // skip
  }

  if (allFiles.length === 0) {
    it.skip('no question bank files found', () => {});
  } else {
    it('normalizes every question in the bank without errors', () => {
      const malformed: MalformedRowReport[] = [];
      let total = 0;
      let ok = 0;

      for (const file of allFiles) {
        const raw = JSON.parse(readFileSync(join(qDir, file), 'utf-8'));
        if (!Array.isArray(raw)) continue;
        total += raw.length;
        const results = normalizeBatch(raw, {
          onMalformed: (r) => malformed.push(r),
        });
        ok += results.length;
      }

      console.log(`Normalized ${ok}/${total}. Malformed: ${malformed.length}`);
      if (malformed.length > 0) {
        const byReason = new Map<string, number>();
        for (const m of malformed) {
          const key = m.reason.slice(0, 80);
          byReason.set(key, (byReason.get(key) ?? 0) + 1);
        }
        for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
          console.log(`  ${count}x: ${reason}`);
        }
      }

      expect(malformed.length).toBe(0);
    });
  }
});
