// Declared in src/types.ts so the bridge can use them without importing this folder (Ruling 17).
export type { HelpFamily, StrategyId, HelpRecord, HelpEventReport } from '../types';
/** mult: a × b = c. div: a ÷ b = c. Exactly one of a, b, c is null: the unknown. */
export interface HelpFact {
  op: 'mult' | 'div';
  a: number | null;
  b: number | null;
  c: number | null;
}
/** a × b, solved and visible. */
export interface SolvedFact {
  a: number;
  b: number;
}
/** A message key and its numbers. Each param name starts with its role: given, anchor or partial. */
export interface MsgRef {
  key: string;
  params: Record<string, number>;
}
export type HelpPicture =
  /** Totals are shown for rows 1..counted only. */
  | { kind: 'rows'; rows: number; perRow: number; counted: number }
  /** `dealt` objects placed so far. */
  | { kind: 'deal'; total: number; rows: number; dealt: number }
  /** `taken` groups removed so far. */
  | { kind: 'take'; total: number; size: number; taken: number };
export interface HelpStep {
  say: MsgRef;
  picture: HelpPicture | null;
  points: SolvedFact[];
}
