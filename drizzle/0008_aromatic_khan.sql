CREATE TABLE "programmed_workouts" (
	"id" text PRIMARY KEY NOT NULL,
	"class_session_id" text NOT NULL,
	"workout" jsonb NOT NULL,
	"source_workout_id" text,
	"programmed_by_athlete_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "programmed_workouts" ADD CONSTRAINT "programmed_workouts_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programmed_workouts" ADD CONSTRAINT "programmed_workouts_source_workout_id_workouts_id_fk" FOREIGN KEY ("source_workout_id") REFERENCES "public"."workouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programmed_workouts" ADD CONSTRAINT "programmed_workouts_programmed_by_athlete_id_athletes_id_fk" FOREIGN KEY ("programmed_by_athlete_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "programmed_workouts_session_idx" ON "programmed_workouts" USING btree ("class_session_id");--> statement-breakpoint
CREATE INDEX "programmed_workouts_source_idx" ON "programmed_workouts" USING btree ("source_workout_id");