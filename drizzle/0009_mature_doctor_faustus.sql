CREATE TABLE "assigned_workouts" (
	"id" text PRIMARY KEY NOT NULL,
	"reservation_id" text NOT NULL,
	"workout" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "load_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" text NOT NULL,
	"movement_id" text NOT NULL,
	"ratio" numeric(5, 4) NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "load_adjustments_ratio_check" CHECK ("load_adjustments"."ratio" > 0 and "load_adjustments"."ratio" <= 1)
);
--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD CONSTRAINT "assigned_workouts_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_adjustments" ADD CONSTRAINT "load_adjustments_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assigned_workouts_reservation_idx" ON "assigned_workouts" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "load_adjustments_active_movement_idx" ON "load_adjustments" USING btree ("athlete_id","movement_id") WHERE "load_adjustments"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "load_adjustments_athlete_idx" ON "load_adjustments" USING btree ("athlete_id");