-- Local development seed (runs after migrations on `supabase db reset`).
--
-- Administrators are NOT seeded here: create them with
--   npm run admin:create -- --email you@example.com --name "Your Name"
-- so no password ever lives in the repository.
--
-- Example daily quote so /api/quotes/today has data locally.
insert into public.daily_quotes (quote_date, quote_text, author, commentary)
values (current_date, 'The best way out is always through.', 'Robert Frost', 'Sample quote for local development.')
on conflict (quote_date) do nothing;
