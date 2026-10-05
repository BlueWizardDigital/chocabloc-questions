#!/usr/bin/env python3
"""Build tests/fixtures/answer-label-rows.json for the answer-label sweep.

Reads mathSkills' generator output (a sibling checkout) and keeps every row of
every format whose picture draws text: area, perimeter, classify triangle,
volume, surface area, circle convert, circumference, pythagorean, triangle
angles, angle classify, multiplication (array and number line) and time.
Data graph and coordinate distance are left out: their axis labels show
numbers by design (PRINTS_ANSWER_BY_DESIGN in format-conformance).

Each row is [skill, format, imageType, content, answer, given], where `given`
is every number the row's question text states.

Usage: python3 scripts/fixtures/answer-label-rows.py [path/to/mathSkillMapping]
(defaults to a mathSkillMapping checkout beside this repo's)
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', 'mathSkillMapping')
DATA = os.path.join(SRC, 'public', 'data', 'questions')
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'answer-label-rows.json')

FORMATS = {
    'geometry_area', 'geometry_perimeter', 'geometry_classify_triangle', 'geometry_volume',
    'geometry_surface_area', 'geometry_circle_convert', 'geometry_circumference', 'pythagorean',
    'geometry_angles', 'geometry_angle_classify', 'multiplication', 'time',
}
# Content keys no draw reads (strings that restate the stem).
DROP = {'operation', 'dimensions', 'sides', 'pi_value', 'method'}
NUMBER = re.compile(r'-?\d+(?:\.\d+)?')


def wanted(row):
    if row.get('format') not in FORMATS:
        return False
    return row['format'] != 'multiplication' or row.get('image_type') in ('array', 'number_line')


def main():
    out = []
    qdir = os.path.join(DATA, 'questions')
    for name in sorted(os.listdir(qdir)):
        if not name.endswith('.json'):
            continue
        skill = name[:-5]
        with open(os.path.join(qdir, name)) as f:
            rows = [r for r in json.load(f) if wanted(r)]
        if not rows:
            continue
        with open(os.path.join(DATA, 'question_texts', name)) as f:
            texts = {t['question_id']: t['question_text'] for t in json.load(f)}
        for r in rows:
            if r['id'] not in texts:
                sys.exit(f'{r["id"]}: no question text')
            given = sorted(set(NUMBER.findall(texts[r['id']])))
            content = {k: v for k, v in r['content'].items() if k not in DROP}
            out.append([skill, r['format'], r.get('image_type'), content, r['answer'], given])
    with open(OUT, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
        f.write('\n')
    print(f'{len(out)} rows -> {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
