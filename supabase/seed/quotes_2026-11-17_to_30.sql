-- =============================================================================
-- Two weeks of opening-screen quotes from John (email, 17 Nov 2026), one per
-- day from Tue 17 Nov to Mon 30 Nov 2026. Run in the Supabase SQL Editor.
--
-- Days that already have a quote are left alone (nothing is overwritten).
-- They can be edited afterwards on the website's Quotes page.
-- =============================================================================

insert into public.daily_quotes (quote_date, quote_text, author, commentary)
values
  ('2026-11-17',
   $q$You can’t go back and change the beginning, but you can start where you are and change the ending$q$,
   $q$C.S. Lewis, UK author, d. 1963$q$,
   $q$Too many people think their past has a grip on them. Mr Lewis says it doesn’t need to.$q$),
  ('2026-11-18',
   $q$Don’t ruin a good day by thinking about a bad yesterday$q$,
   $q$Grant Cardone, US businessman and writer$q$,
   $q$There’s never a need to let the past affect our present.$q$),
  ('2026-11-19',
   $q$What you do today can improve all of your tomorrows$q$,
   $q$Abraham Lincoln$q$,
   $q$And, of course, what you do today can wreck your tomorrows. Try to do Pres Lincoln’s things.$q$),
  ('2026-11-20',
   $q$Before you consider quitting anything, think about why you started it$q$,
   $q$Author unknown$q$,
   $q$The world has too many quitters. There’s usually motivation in why you began.$q$),
  ('2026-11-21',
   $q$It’s OK not to have everything figured out. Know that, in time, you will get there$q$,
   $q$Author unknown$q$,
   $q$As someone else (perhaps) said: Don’t sweat the small stuff.$q$),
  ('2026-11-22',
   $q$The secret to getting ahead is getting started.$q$,
   $q$Mark Twain, US author, d. 1910$q$,
   $q$But I’d add “And getting finished”.$q$),
  ('2026-11-23',
   $q$Birds sing after a storm; why shouldn’t people feel as free to delight in whatever sunlight remains to them?$q$,
   $q$Rose Kennedy, mother of JFK, US President$q$,
   $q$Don’t be upset by the storms of life… Rejoice in what follows.$q$),
  ('2026-11-24',
   $q$Success is one thing you can’t buy for cash up front. You buy it on the instalment plan and make payments every day.$q$,
   $q$Zig Ziglar (1980s motivationalist)$q$,
   $q$In other words, you have to work for whatever you want.$q$),
  ('2026-11-25',
   $q$Great things are not done by impulse, but by a series of small things brought together$q$,
   $q$Vincent van Gogh, painter, d. 1890$q$,
   null),
  ('2026-11-26',
   $q$I was grateful that elephants don’t fly when my car got bird droppings on it.$q$,
   $q$John Ward, Aussie author$q$,
   $q$There’s always lots to be grateful for. No matter how bad things are, they could be worse.$q$),
  ('2026-11-27',
   $q$Quitters never win and winners never quit.$q$,
   $q$Vince Lombardi (US football coach)$q$,
   $q$Like that paint advertisement: Keep on keeping on.$q$),
  ('2026-11-28',
   $q$I firmly believe that nature brings solace in all troubles$q$,
   $q$Anne Frank, Holocaust victim and diarist, died aged 15$q$,
   null),
  ('2026-11-29',
   $q$Sleep! O gentle sleep! Nature’s soft nurse$q$,
   $q$William Shakespeare$q$,
   null),
  ('2026-11-30',
   $q$If you can’t sleep, count sheep. Don’t count endangered animals. You might run out$q$,
   $q$Mitch Hedberg, US comedian$q$,
   null)
on conflict (quote_date) do nothing;

-- Check: should list 14 rows.
select quote_date, left(quote_text, 50) as quote, author
from public.daily_quotes
where quote_date between '2026-11-17' and '2026-11-30'
order by quote_date;
