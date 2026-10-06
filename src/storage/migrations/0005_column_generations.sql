CREATE TABLE column_generations (
  id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL CHECK (generation >= 1)
);
INSERT INTO column_generations(id, generation)
SELECT id, MAX(generation)
FROM (
  SELECT id, version AS generation FROM columns
  UNION ALL
  SELECT
    entity_id,
    MAX(
      CASE
        WHEN state_after_json IS NULL
          THEN COALESCE(json_extract(state_before_json, '$.version'), version_after, 1) + 1
        ELSE COALESCE(
          json_extract(state_after_json, '$.version'),
          version_after,
          json_extract(state_before_json, '$.version'),
          1
        )
      END
    ) AS generation
  FROM change_log_entities
  WHERE entity_kind = 'column'
  GROUP BY entity_id
)
GROUP BY id;
