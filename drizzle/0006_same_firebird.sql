ALTER TABLE "class_sessions" ADD COLUMN "coach_athlete_id" text;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN "time_zone" text;--> statement-breakpoint
UPDATE "class_sessions" AS sessions
SET "coach_athlete_id" = classes."coach_athlete_id",
    "time_zone" = classes."time_zone"
FROM "classes"
WHERE classes."id" = sessions."class_id";--> statement-breakpoint
ALTER TABLE "class_sessions" ALTER COLUMN "time_zone" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_coach_athlete_id_athletes_id_fk" FOREIGN KEY ("coach_athlete_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;
