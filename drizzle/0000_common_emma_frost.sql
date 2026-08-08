CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athletes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"sex" text NOT NULL,
	"equipment" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_duration" integer,
	"framework" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impediments" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"affected_regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"trimester" integer,
	"weeks_postpartum" integer,
	"constraints" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_records" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" text NOT NULL,
	"reference_id" text NOT NULL,
	"reference_type" text NOT NULL,
	"category" text NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"unit" text NOT NULL,
	"achieved_at" timestamp with time zone NOT NULL,
	"workout_result_id" text,
	"previous_value" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" text NOT NULL,
	"date" text NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_duration_minutes" integer NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_results" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" text NOT NULL,
	"workout_id" text NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"score_type" text NOT NULL,
	"time_seconds" integer,
	"rounds_completed" integer,
	"partial_reps" integer,
	"peak_load" integer,
	"total_reps" integer,
	"total_calories" integer,
	"total_distance" integer,
	"rpe" numeric(3, 1),
	"rx" boolean DEFAULT false NOT NULL,
	"scaling_tier" text,
	"movement_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"movements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_cap" integer,
	"rounds" integer,
	"work_interval" integer,
	"rest_interval" integer,
	"emom_minutes" integer,
	"score_type" text NOT NULL,
	"description" text,
	"is_benchmark" boolean DEFAULT false NOT NULL,
	"benchmark_category" text,
	"estimated_duration" integer,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impediments" ADD CONSTRAINT "impediments_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_workout_result_id_workout_results_id_fk" FOREIGN KEY ("workout_result_id") REFERENCES "public"."workout_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_results" ADD CONSTRAINT "workout_results_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_results" ADD CONSTRAINT "workout_results_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_created_by_athletes_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "athletes_user_id_idx" ON "athletes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "impediments_athlete_idx" ON "impediments" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "personal_records_athlete_idx" ON "personal_records" USING btree ("athlete_id","achieved_at");--> statement-breakpoint
CREATE INDEX "training_sessions_athlete_idx" ON "training_sessions" USING btree ("athlete_id","date");--> statement-breakpoint
CREATE INDEX "workout_results_athlete_performed_idx" ON "workout_results" USING btree ("athlete_id","performed_at");--> statement-breakpoint
CREATE INDEX "workouts_created_by_idx" ON "workouts" USING btree ("created_by");