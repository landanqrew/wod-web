ALTER TABLE "impediments" ADD COLUMN "affected_muscles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "impediments" ADD COLUMN "affected_joints" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "impediments"
SET
  "affected_muscles" = COALESCE(
    (
      SELECT jsonb_agg(region)
      FROM jsonb_array_elements_text("affected_regions") AS parts(region)
      WHERE region IN (
        'shoulders', 'chest', 'upper_back', 'lats', 'biceps', 'triceps',
        'forearms', 'core', 'lower_back', 'obliques', 'quads', 'hamstrings',
        'glutes', 'calves', 'hip_flexors', 'adductors'
      )
    ),
    '[]'::jsonb
  ),
  "affected_joints" = COALESCE(
    (
      SELECT jsonb_agg(region)
      FROM jsonb_array_elements_text("affected_regions") AS parts(region)
      WHERE region IN ('wrists', 'elbows', 'knees', 'ankles', 'hips', 'spine', 'neck')
    ),
    '[]'::jsonb
  ),
  "constraints" = ("constraints" - 'avoidRegions') || jsonb_build_object(
    'avoidMuscles',
    COALESCE(
      (
        SELECT jsonb_agg(region)
        FROM jsonb_array_elements_text(COALESCE("constraints"->'avoidRegions', '[]'::jsonb)) AS parts(region)
        WHERE region IN (
          'shoulders', 'chest', 'upper_back', 'lats', 'biceps', 'triceps',
          'forearms', 'core', 'lower_back', 'obliques', 'quads', 'hamstrings',
          'glutes', 'calves', 'hip_flexors', 'adductors'
        )
      ),
      '[]'::jsonb
    ),
    'avoidJoints',
    COALESCE(
      (
        SELECT jsonb_agg(region)
        FROM jsonb_array_elements_text(COALESCE("constraints"->'avoidRegions', '[]'::jsonb)) AS parts(region)
        WHERE region IN ('wrists', 'elbows', 'knees', 'ankles', 'hips', 'spine', 'neck')
      ),
      '[]'::jsonb
    )
  );--> statement-breakpoint
ALTER TABLE "impediments" DROP COLUMN "affected_regions";
