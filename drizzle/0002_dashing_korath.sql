ALTER TABLE "workouts" DROP CONSTRAINT "workouts_created_by_athletes_id_fk";
--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_created_by_athletes_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;