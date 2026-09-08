CREATE TABLE `quote_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`zip` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`dogs` text NOT NULL,
	`frequency` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
