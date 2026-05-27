#!/usr/bin/env bash
# Dumps question-bank data from Postgres into JSON files for offline use.
# Usage: ./scripts/db-snapshot/snapshot.sh
#
# Env overrides: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL

set -euo pipefail

HOST="${DB_HOST:-localhost}"
PORT="${DB_PORT:-5432}"
NAME="${DB_NAME:-questor_games_dev}"
USER="${DB_USER:-davidbrabbins}"
PASS="${DB_PASSWORD:-}"
SSL="${DB_SSL:-false}"

OUTDIR="$(cd "$(dirname "$0")" && pwd)"

SSLMODE="disable"
[[ "$SSL" == "true" ]] && SSLMODE="require"

export PGPASSWORD="$PASS"
PSQL="psql -h $HOST -p $PORT -U $USER -d $NAME --no-psqlrc -tAX"

run_json() {
  local label="$1" query="$2" outfile="$OUTDIR/$3"
  echo "  ↳ $label → $3"
  $PSQL -c "COPY (SELECT json_agg(t) FROM ($query) t) TO STDOUT" > "$outfile"
  # Pretty-print if python3 available
  if command -v python3 &>/dev/null; then
    python3 -m json.tool "$outfile" > "${outfile}.tmp" 2>/dev/null && mv "${outfile}.tmp" "$outfile" || rm -f "${outfile}.tmp"
  fi
}

echo "Snapshotting from $NAME@$HOST:$PORT …"
echo ""

# 1. All skills (full table)
run_json "all skills" \
  "SELECT skill_id, category_id, operation, grade_suggestion,
          description, example, image_type, commutative,
          common_data, constraints
   FROM skills
   ORDER BY grade_suggestion, skill_id" \
  "skills.json"

# 2. Image-type summary (counts)
run_json "image_type counts" \
  "SELECT image_type, COUNT(*) AS skill_count
   FROM skills
   WHERE image_type IS NOT NULL
   GROUP BY image_type
   ORDER BY skill_count DESC" \
  "image-type-counts.json"

# 3. Sample questions per image_type (up to 3 each, with distractors)
run_json "sample questions per image_type" \
  "SELECT sub.image_type, sub.question_id, sub.content, sub.answer,
          sub.format, sub.difficulty, sub.stratum,
          sub.skill_ids, sub.distractors
   FROM (
     SELECT q.image_type, q.question_id, q.content, q.answer,
            q.format, q.difficulty, q.stratum,
            (SELECT json_agg(qs2.skill_id)
             FROM question_skills qs2
             WHERE qs2.question_id = q.question_id) AS skill_ids,
            (SELECT json_agg(json_build_object(
               'value', d.value,
               'error_type', d.error_type,
               'order', d.\"order\"
             ) ORDER BY d.\"order\")
             FROM distractors d
             WHERE d.question_id = q.question_id) AS distractors,
            ROW_NUMBER() OVER (PARTITION BY q.image_type ORDER BY q.question_id) AS rn
     FROM questions q
     WHERE q.image_type IS NOT NULL
   ) sub
   WHERE sub.rn <= 3
   ORDER BY sub.image_type, sub.question_id" \
  "samples-by-image-type.json"

# 4. Sample questions with NO image_type (text-only) — up to 5
run_json "text-only samples" \
  "SELECT sub.*
   FROM (
     SELECT q.question_id, q.content, q.answer, q.format,
            q.difficulty, q.stratum,
            (SELECT json_agg(qs2.skill_id)
             FROM question_skills qs2
             WHERE qs2.question_id = q.question_id) AS skill_ids,
            (SELECT json_agg(json_build_object(
               'value', d.value,
               'error_type', d.error_type,
               'order', d.\"order\"
             ) ORDER BY d.\"order\")
             FROM distractors d
             WHERE d.question_id = q.question_id) AS distractors,
            ROW_NUMBER() OVER (ORDER BY q.question_id) AS rn
     FROM questions q
     WHERE q.image_type IS NULL
   ) sub
   WHERE sub.rn <= 5
   ORDER BY sub.question_id" \
  "samples-text-only.json"

# 5. Skills with image_type (visual skills only, for quick reference)
run_json "visual skills" \
  "SELECT skill_id, category_id, grade_suggestion, description,
          image_type, operation, common_data, constraints
   FROM skills
   WHERE image_type IS NOT NULL
   ORDER BY image_type, grade_suggestion" \
  "visual-skills.json"

# 6. Per image_type: deeper sample (10 per type) for format analysis
for img_type in coins table angle circle_parts compound_shape right_triangle \
                bar_graph pictograph shape_2d shape_3d fraction_visual \
                analog_clock coordinate_grid coordinate_plane number_line \
                pattern_visual shape_shaded array; do
  run_json "$img_type questions (up to 10)" \
    "SELECT sub.*
     FROM (
       SELECT q.question_id, q.image_type, q.content, q.answer,
              q.format, q.difficulty, q.stratum,
              (SELECT json_agg(qs2.skill_id)
               FROM question_skills qs2
               WHERE qs2.question_id = q.question_id) AS skill_ids,
              (SELECT json_agg(json_build_object(
                 'value', d.value,
                 'error_type', d.error_type,
                 'order', d.\"order\"
               ) ORDER BY d.\"order\")
               FROM distractors d
               WHERE d.question_id = q.question_id) AS distractors,
              ROW_NUMBER() OVER (ORDER BY q.question_id) AS rn
       FROM questions q
       WHERE q.image_type = '$img_type'
     ) sub
     WHERE sub.rn <= 10
     ORDER BY sub.question_id" \
    "type-${img_type}.json"
done

echo ""
echo "Done. Files in: $OUTDIR"
echo ""
ls -lh "$OUTDIR"/*.json | awk '{print "  " $5 "  " $NF}'
