CREATE TABLE "gym_equipment" (
	"gym_id" text NOT NULL,
	"equipment" text NOT NULL,
	"station_count" integer,
	CONSTRAINT "gym_equipment_gym_id_equipment_pk" PRIMARY KEY("gym_id","equipment")
);
--> statement-breakpoint
CREATE TABLE "gyms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_athlete_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_owner_athlete_id_athletes_id_fk" FOREIGN KEY ("owner_athlete_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gyms_owner_athlete_idx" ON "gyms" USING btree ("owner_athlete_id");