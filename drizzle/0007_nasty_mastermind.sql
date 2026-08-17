CREATE TABLE "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"class_session_id" text NOT NULL,
	"athlete_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_session_athlete_idx" ON "reservations" USING btree ("class_session_id","athlete_id");--> statement-breakpoint
CREATE INDEX "reservations_athlete_idx" ON "reservations" USING btree ("athlete_id");