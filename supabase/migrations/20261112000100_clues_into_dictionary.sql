-- =============================================================================
-- Clues go into the Clue Dictionary as they are written (client request)
--
-- Before: the dictionary was filled only when a puzzle was published (stored).
-- Now, as soon as a word in a draft has all three clues, they are saved in the
-- dictionary too:
--   * the word's dictionary entry is linked to the puzzle's clues
--     (puzzle_clues.source_clue_set_id), and later edits update that same
--     entry, so the newest clues are "saved over" the previous ones instead
--     of piling up;
--   * if the edited clues are identical to another entry for the word, the
--     puzzle is linked to that entry instead (entries stay unique);
--   * words later removed from the grid keep their clues in the dictionary,
--     ready to be filled in automatically next time the word is used.
-- Unfinished clue sets (fewer than three clues) are not added.
--
-- Publishing is unchanged: it records which puzzle used which entry.
-- Published puzzles keep their own frozen copy of their clues.
--
-- Also copies the finished clues already in draft puzzles into the dictionary.
-- Safe to run more than once.
-- =============================================================================

-- Adds or updates the dictionary entry for one word's three clues and links the
-- puzzle's clues to it. Returns the entry's id.
create or replace function public.sync_clues_to_dictionary(
  p_puzzle_word_id uuid,
  p_admin_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_answer    text;
  v_puzzle_id uuid;
  v_harder    text;
  v_medium    text;
  v_easier    text;
  v_source    uuid;
  v_dict_id   uuid;
  v_set_id    uuid;
begin
  select w.answer, w.puzzle_id, btrim(c.harder_clue), btrim(c.medium_clue), btrim(c.easier_clue), c.source_clue_set_id
    into v_answer, v_puzzle_id, v_harder, v_medium, v_easier, v_source
  from public.puzzle_words w
  join public.puzzle_clues c on c.puzzle_word_id = w.id
  where w.id = p_puzzle_word_id;

  if v_answer is null or v_harder = '' or v_medium = '' or v_easier = '' then
    return null; -- not three clues yet
  end if;

  insert into public.dictionary_words (normalized_word)
  values (v_answer)
  on conflict (normalized_word) do nothing;
  select d.id into v_dict_id from public.dictionary_words d where d.normalized_word = v_answer;

  -- The same three clues already in the dictionary for this word?
  select s.id into v_set_id
  from public.dictionary_clue_sets s
  where s.dictionary_word_id = v_dict_id
    and s.harder_clue = v_harder and s.medium_clue = v_medium and s.easier_clue = v_easier;

  if v_set_id is null then
    if v_source is not null and exists (
      select 1 from public.dictionary_clue_sets s where s.id = v_source and s.dictionary_word_id = v_dict_id
    ) then
      -- Edited clues: save them over the entry they came from.
      update public.dictionary_clue_sets s
      set harder_clue = v_harder, medium_clue = v_medium, easier_clue = v_easier
      where s.id = v_source;
      v_set_id := v_source;
    else
      insert into public.dictionary_clue_sets (
        dictionary_word_id, harder_clue, medium_clue, easier_clue, source_puzzle_id, created_by
      ) values (v_dict_id, v_harder, v_medium, v_easier, v_puzzle_id, p_admin_id)
      returning id into v_set_id;
    end if;
  else
    -- Identical entry: mark it as the most recently used for this word.
    update public.dictionary_clue_sets s set updated_at = now() where s.id = v_set_id;
  end if;

  if v_source is distinct from v_set_id then
    update public.puzzle_clues c set source_clue_set_id = v_set_id where c.puzzle_word_id = p_puzzle_word_id;
  end if;
  return v_set_id;
end;
$$;
revoke all on function public.sync_clues_to_dictionary(uuid, uuid) from public, anon;
grant execute on function public.sync_clues_to_dictionary(uuid, uuid) to authenticated;

-- save_puzzle_clues: as before, plus the dictionary sync above. A clue list
-- item without sourceClueSetId keeps the existing link (the editor doesn't
-- know which entry the database linked), so edits keep updating one entry.
create or replace function public.save_puzzle_clues(p_puzzle_id uuid, p_clues jsonb)
returns table (updated_at timestamptz, word_count integer, completed_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_admin_id   uuid := public.current_admin_id();
  v_puzzle     public.puzzles%rowtype;
  v_item       jsonb;
  v_word_id    uuid;
  v_harder     text;
  v_medium     text;
  v_easier     text;
  v_words      integer;
  v_completed  integer;
  v_updated_at timestamptz;
begin
  if v_admin_id is null then
    raise exception 'Only administrators can edit puzzles' using errcode = 'insufficient_privilege';
  end if;

  select * into v_puzzle from public.puzzles p where p.id = p_puzzle_id for update;
  if not found then
    raise exception 'Puzzle not found' using errcode = 'no_data_found';
  end if;
  if v_puzzle.published_at is not null or v_puzzle.status in ('published', 'archived') then
    raise exception 'Published and archived puzzles cannot be changed' using errcode = 'check_violation';
  end if;
  if v_puzzle.grid_finalized_at is null then
    raise exception 'The grid has changed. Click Done on the grid before adding clues.'
      using errcode = 'serialization_failure';
  end if;
  if p_clues is null or jsonb_typeof(p_clues) <> 'array' then
    raise exception 'A list of clues is required' using errcode = 'invalid_parameter_value';
  end if;

  for v_item in select value from jsonb_array_elements(p_clues) loop
    v_word_id := nullif(v_item ->> 'wordId', '')::uuid;
    v_harder := btrim(coalesce(v_item ->> 'harder', ''));
    v_medium := btrim(coalesce(v_item ->> 'medium', ''));
    v_easier := btrim(coalesce(v_item ->> 'easier', ''));

    update public.puzzle_clues c
    set harder_clue = v_harder,
        medium_clue = v_medium,
        easier_clue = v_easier,
        source_clue_set_id = coalesce(nullif(v_item ->> 'sourceClueSetId', '')::uuid, c.source_clue_set_id),
        updated_by = v_admin_id
    from public.puzzle_words w
    where w.id = c.puzzle_word_id
      and w.puzzle_id = p_puzzle_id
      and c.puzzle_word_id = v_word_id;

    if not found then
      -- The word list was regenerated (grid Done) since the page loaded.
      raise exception 'The word list has changed. Reload the page to see the latest words.'
        using errcode = 'serialization_failure';
    end if;

    perform public.sync_clues_to_dictionary(v_word_id, v_admin_id);
  end loop;

  select count(*),
         count(*) filter (where btrim(c.harder_clue) <> '' and btrim(c.medium_clue) <> '' and btrim(c.easier_clue) <> '')
    into v_words, v_completed
  from public.puzzle_words w
  left join public.puzzle_clues c on c.puzzle_word_id = w.id
  where w.puzzle_id = p_puzzle_id;

  update public.puzzles p
  set updated_by = v_admin_id,
      status = case when p.status = 'ready' and v_completed < v_words then 'draft'::public.puzzle_status else p.status end
  where p.id = p_puzzle_id
  returning p.updated_at into v_updated_at;

  return query select v_updated_at, v_words, v_completed;
end;
$$;
revoke all on function public.save_puzzle_clues(uuid, jsonb) from public, anon;
grant execute on function public.save_puzzle_clues(uuid, jsonb) to authenticated;

-- Existing drafts: put their finished clue sets into the dictionary now.
do $$
declare
  v_word_id uuid;
begin
  for v_word_id in
    select c.puzzle_word_id
    from public.puzzle_clues c
    join public.puzzle_words w on w.id = c.puzzle_word_id
    join public.puzzles p on p.id = w.puzzle_id
    where p.published_at is null
      and btrim(c.harder_clue) <> '' and btrim(c.medium_clue) <> '' and btrim(c.easier_clue) <> ''
    order by c.updated_at
  loop
    perform public.sync_clues_to_dictionary(v_word_id, null);
  end loop;
end;
$$;
