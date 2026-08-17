CREATE TABLE "memberships" (
	"gym_id" text NOT NULL,
	"athlete_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_gym_id_athlete_id_pk" PRIMARY KEY("gym_id","athlete_id")
);
--> statement-breakpoint
INSERT INTO "memberships" ("gym_id", "athlete_id", "role")
SELECT "id", "owner_athlete_id", 'owner'
FROM "gyms"
WHERE "owner_athlete_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "gyms" DROP CONSTRAINT "gyms_owner_athlete_id_athletes_id_fk";
--> statement-breakpoint
DROP INDEX "gyms_owner_athlete_idx";--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_athlete_idx" ON "memberships" USING btree ("athlete_id");--> statement-breakpoint
ALTER TABLE "gyms" DROP COLUMN "owner_athlete_id";
