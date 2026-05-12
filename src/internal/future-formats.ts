// Internal-only future format types. DO NOT export from public barrels.
// These exist for forward-planning and internal review. The public
// NormalizedQuestion union in src/types.ts intentionally excludes them
// until each format's renderer + helpers ship.

import type { AnswerValue, BaseQuestion, Distractor } from '../types';

export type DataGraphQuestion = BaseQuestion & {
  format: 'data_graph';
  imageType: 'bar_graph' | 'pictograph';
  content: {
    data: Record<string, number>;
    prompt: string;
  };
  answer: string;
  distractors: Distractor[];
};

export type CoordinateQuestion = BaseQuestion & {
  format: 'coordinate';
  imageType: 'coordinate_plane';
  content: { point: [number, number] };
  answer: string;
  distractors: Distractor[];
};

export type NumberLineQuestion = BaseQuestion & {
  format: 'number_line';
  imageType: 'number_line';
  content: { number: number };
  answer: number;
  distractors: Distractor[];
};

export type GeometryAreaQuestion = BaseQuestion & {
  format: 'geometry_area';
  imageType?: undefined;
  content: { shape: string; operands: number[]; dimensions?: string };
  answer: number;
  distractors: Distractor[];
};

export type GeometryAnglesQuestion = BaseQuestion & {
  format: 'geometry_angles';
  imageType?: undefined;
  content: { knownAngles: number[]; missingAngle: number };
  answer: number;
  distractors: Distractor[];
};

export type GeometryVolumeQuestion = BaseQuestion & {
  format: 'geometry_volume';
  imageType?: undefined;
  content: { shape: string; operands: number[] };
  answer: number;
  distractors: Distractor[];
};

export type GeometryPropertiesQuestion = BaseQuestion & {
  format: 'geometry_properties';
  imageType: 'shape_2d' | 'shape_3d';
  content: { shape: string; property: string };
  answer: AnswerValue;
  distractors: Distractor[];
};

export type PythagoreanQuestion = BaseQuestion & {
  format: 'pythagorean';
  imageType?: undefined;
  content: { legs: [number, number]; hypotenuse: number };
  answer: number;
  distractors: Distractor[];
};

export type CoordDistanceQuestion = BaseQuestion & {
  format: 'coordinate_distance';
  imageType?: undefined;
  content: { point1: [number, number]; point2: [number, number] };
  answer: number;
  distractors: Distractor[];
};

export type FutureFormatQuestion =
  | DataGraphQuestion
  | CoordinateQuestion
  | NumberLineQuestion
  | GeometryAreaQuestion
  | GeometryAnglesQuestion
  | GeometryVolumeQuestion
  | GeometryPropertiesQuestion
  | PythagoreanQuestion
  | CoordDistanceQuestion;
