-- Reconstruct the counter from each ID's ordered history because v4 reset reused IDs to version 1.
WITH ordered_column_history AS (
  SELECT
    entities.entry_id,
    entities.entity_id,
    entities.state_before_json,
    entities.state_after_json,
    entities.version_after,
    ROW_NUMBER() OVER (
      PARTITION BY entities.entity_id
      ORDER BY history.revision, history.id
    ) AS event_number,
    FIRST_VALUE(entities.state_before_json) OVER (
      PARTITION BY entities.entity_id
      ORDER BY history.revision, history.id
    ) AS first_state_before_json
  FROM change_log_entities AS entities
  JOIN change_log AS history ON history.id = entities.entry_id
  WHERE entities.entity_kind = 'column'
),
translated_tombstones AS (
  SELECT
    entry_id,
    entity_id,
    MAX(
      COALESCE(
        version_after,
        COALESCE(json_extract(state_before_json, '$.version'), 1) + 1
      ),
      COALESCE(json_extract(first_state_before_json, '$.version'), 0)
        + event_number
    ) AS generation
  FROM ordered_column_history
  WHERE state_after_json IS NULL
)
UPDATE change_log_entities
SET version_after = (
  SELECT translated.generation
  FROM translated_tombstones AS translated
  WHERE translated.entry_id = change_log_entities.entry_id
)
WHERE entity_kind = 'column'
  AND state_after_json IS NULL;

INSERT INTO column_generations(id, generation)
SELECT entity_id, MAX(version_after)
FROM change_log_entities
WHERE entity_kind = 'column'
  AND state_after_json IS NULL
  AND version_after IS NOT NULL
GROUP BY entity_id
ON CONFLICT(id) DO UPDATE SET
  generation = MAX(column_generations.generation, excluded.generation);
