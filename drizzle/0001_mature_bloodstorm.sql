CREATE INDEX `idx_quote_requests_created_at` ON `quote_requests` (`created_at`);
--> statement-breakpoint
PRAGMA optimize;
