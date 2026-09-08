import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const quoteRequests = sqliteTable(
  'quote_requests',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    zip: text('zip').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    dogs: text('dogs').notNull(),
    frequency: text('frequency').notNull(),
    notes: text('notes').notNull().default(''),
    status: text('status').notNull().default('new'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('idx_quote_requests_created_at').on(table.createdAt)],
);
