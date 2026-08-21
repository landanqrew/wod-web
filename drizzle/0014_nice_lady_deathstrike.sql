ALTER TABLE "workout_results" ADD COLUMN "source_workout_id" text;--> statement-breakpoint
ALTER TABLE "workout_results" ADD COLUMN "class_session_id" text;--> statement-breakpoint
ALTER TABLE "workout_results" ADD CONSTRAINT "workout_results_source_workout_id_workouts_id_fk" FOREIGN KEY ("source_workout_id") REFERENCES "public"."workouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_results" ADD CONSTRAINT "workout_results_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_results_assigned_idx" ON "workout_results" USING btree ("assigned_workout_id");--> statement-breakpoint
CREATE INDEX "workout_results_source_session_idx" ON "workout_results" USING btree ("source_workout_id","class_session_id");