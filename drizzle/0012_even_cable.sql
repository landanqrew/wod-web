ALTER TABLE "workouts" ADD COLUMN "gym_id" text;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workouts_gym_idx" ON "workouts" USING btree ("gym_id");