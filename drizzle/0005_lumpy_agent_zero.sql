CREATE TABLE "class_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"local_date" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" text PRIMARY KEY NOT NULL,
	"gym_id" text NOT NULL,
	"name" text NOT NULL,
	"coach_athlete_id" text,
	"weekly_times" jsonb NOT NULL,
	"time_zone" text NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_coach_athlete_id_athletes_id_fk" FOREIGN KEY ("coach_athlete_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_sessions_class_starts_idx" ON "class_sessions" USING btree ("class_id","starts_at");--> statement-breakpoint
CREATE INDEX "class_sessions_starts_idx" ON "class_sessions" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "classes_gym_idx" ON "classes" USING btree ("gym_id");