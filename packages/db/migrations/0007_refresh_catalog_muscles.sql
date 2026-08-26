-- Refresh persisted catalog muscle snapshots after the catalog taxonomy update.
-- Unknown and custom exercise slugs intentionally retain their stored values.

UPDATE plan_days
SET sessions = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN session->>'kind' = 'training' THEN
          jsonb_set(
            session,
            '{blocks}',
            (
              SELECT COALESCE(
                jsonb_agg(
                  CASE
                    WHEN block ? 'slots' THEN
                      jsonb_set(
                        block,
                        '{slots}',
                        (
                          SELECT COALESCE(
                            jsonb_agg(
                              CASE slot->>'exerciseSlug'
                                WHEN 'conventional-deadlift' THEN
                                  jsonb_set(slot, '{primaryMuscles}', '["hamstrings"]'::jsonb)
                                WHEN 'incline-barbell-bench' THEN
                                  jsonb_set(slot, '{primaryMuscles}', '["chest"]'::jsonb)
                                WHEN 'incline-db-press' THEN
                                  jsonb_set(slot, '{primaryMuscles}', '["chest"]'::jsonb)
                                WHEN 'face-pull' THEN
                                  jsonb_set(slot, '{primaryMuscles}', '["back"]'::jsonb)
                                WHEN 'farmer-carry' THEN
                                  jsonb_set(slot, '{primaryMuscles}', '["full_body"]'::jsonb)
                                WHEN 'mountain-climber' THEN
                                  jsonb_set(slot, '{primaryMuscles}', '["core"]'::jsonb)
                                ELSE slot
                              END
                            ),
                            '[]'::jsonb
                          )
                          FROM jsonb_array_elements(block->'slots') AS slot
                        )
                      )
                    ELSE block
                  END
                ),
                '[]'::jsonb
              )
              FROM jsonb_array_elements(session->'blocks') AS block
            )
          )
        ELSE session
      END
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(plan_days.sessions) AS session
);
