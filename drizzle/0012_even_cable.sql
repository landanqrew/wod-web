ALTER TABLE "workouts" ADD COLUMN "gym_id" text;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
WITH female_loads(workout_id, movement_id, female_load) AS (
	VALUES
		('benchmark_fran', 'thruster', 65),
		('benchmark_grace', 'clean_and_jerk', 95),
		('benchmark_helen', 'kettlebell_swing', 35),
		('benchmark_diane', 'deadlift', 155),
		('benchmark_elizabeth', 'clean', 95),
		('benchmark_isabel', 'snatch', 95),
		('benchmark_jackie', 'thruster', 35),
		('benchmark_karen', 'wall_ball_shot', 14),
		('benchmark_nancy', 'overhead_squat', 65),
		('benchmark_dt', 'deadlift', 105),
		('benchmark_dt', 'hang_power_clean', 105),
		('benchmark_dt', 'push_jerk', 105),
		('benchmark_filthy_fifty', 'kettlebell_swing', 26),
		('benchmark_filthy_fifty', 'push_press', 35),
		('benchmark_filthy_fifty', 'wall_ball_shot', 14),
		('benchmark_badger', 'clean', 65),
		('benchmark_fight_gone_bad', 'wall_ball_shot', 14),
		('benchmark_fight_gone_bad', 'sumo_deadlift_high_pull', 55),
		('benchmark_fight_gone_bad', 'push_press', 55),
		('benchmark_kalsu', 'thruster', 95)
), rewritten AS (
	SELECT
		w.id,
		jsonb_agg(
			CASE
				WHEN f.female_load IS NULL OR movement.value ? 'rxLoad' THEN movement.value
				ELSE movement.value || jsonb_build_object(
					'rxLoad', jsonb_build_object(
						'male', (movement.value ->> 'load')::numeric,
						'female', f.female_load
					)
				)
			END
			ORDER BY movement.ordinality
		) AS movements
	FROM "workouts" w
	CROSS JOIN LATERAL jsonb_array_elements(w."movements") WITH ORDINALITY AS movement(value, ordinality)
	LEFT JOIN female_loads f
		ON f.workout_id = w.id
		AND f.movement_id = movement.value ->> 'movementId'
	WHERE w.id IN (SELECT DISTINCT workout_id FROM female_loads)
	GROUP BY w.id
)
UPDATE "workouts" w
SET "movements" = rewritten.movements
FROM rewritten
WHERE w.id = rewritten.id;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workouts_gym_idx" ON "workouts" USING btree ("gym_id");
