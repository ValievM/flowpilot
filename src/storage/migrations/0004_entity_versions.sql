ALTER TABLE columns ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
ALTER TABLE settings ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
UPDATE change_log_entities SET state_before_json = json_set(state_before_json, '$.version', 1), state_after_json = json_set(state_after_json, '$.version', 1), version_after = CASE WHEN state_after_json IS NULL THEN NULL ELSE 1 END WHERE entity_kind IN ('column', 'setting');
