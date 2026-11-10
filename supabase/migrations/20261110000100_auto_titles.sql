-- =============================================================================
-- Puzzle titles from the first across word (client request)
--
-- From now on the website titles a puzzle as its grid is typed: the first
-- across word, e.g. JEALOUSY, or JEALOUSY2, JEALOUSY3… when that name is
-- already taken. A title someone typed is never replaced.
--
-- This gives the same kind of title to every existing puzzle that has none,
-- so the Puzzle List no longer shows "Untitled draft". The first across word
-- is the leftmost run of two or more letters in the highest row that has one
-- (firstAcrossWord() in src/lib/puzzle/grid.ts). Puzzles with no across word
-- yet keep no title. Safe to run more than once.
-- =============================================================================

with untitled as (
  select p.id,
         p.created_at,
         (select (regexp_match(r.line, '[A-Z]{2,}'))[1]
            from jsonb_array_elements_text(p.grid_data) with ordinality as r(line, n)
           where r.line ~ '[A-Z]{2,}'
           order by r.n
           limit 1) as word
  from public.puzzles p
  where p.title is null or btrim(p.title) = ''
),
numbered as (
  select u.id,
         u.word,
         -- Several untitled puzzles with the same word: oldest first.
         row_number() over (partition by u.word order by u.created_at, u.id) as rank,
         -- The highest number already used for this word (JEALOUSY counts as 1).
         coalesce((
           select max(case when t.title = u.word then 1
                           else substring(t.title from char_length(u.word) + 1)::int end)
             from public.puzzles t
            where t.title ~ ('^' || u.word || '[0-9]*$')
         ), 0) as taken
  from untitled u
  where u.word is not null
)
update public.puzzles p
set title = case when n.taken + n.rank = 1 then n.word else n.word || (n.taken + n.rank)::text end
from numbered n
where p.id = n.id;
