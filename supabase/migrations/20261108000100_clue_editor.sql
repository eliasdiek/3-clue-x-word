-- =============================================================================
-- 3-Clue X-Word: clue editor (build step 6)
--
-- save_puzzle_clues(): saves a batch of clue edits in one transaction.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- save_puzzle_clues
--
-- p_clues is a JSON array of
--   { "wordId": uuid, "harder": text, "medium": text, "easier": text,
--     "sourceClueSetId": uuid | null }
-- Clues are trimmed. Blank clues are allowed while working (the clue check
-- and publish_puzzle() refuse incomplete puzzles).
--
-- The puzzle row is touched so its updated_at changes: publish_puzzle()
-- refuses a publish if anything changed after the puzzle was reviewed. A
-- puzzle marked "ready" goes back to "draft" if a clue is cleared.
--
-- SECURITY INVOKER: Row Level Security applies; triggers keep published
-- puzzles locked.
-- ---------------------------------------------------------------------------
create function public.save_puzzle_clues(p_puzzle_id uuid, p_clues jsonb)
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
    v_harder := btrim(coalesce(v_item ->> 'harder', ''));
    v_medium := btrim(coalesce(v_item ->> 'medium', ''));
    v_easier := btrim(coalesce(v_item ->> 'easier', ''));

    update public.puzzle_clues c
    set harder_clue = v_harder,
        medium_clue = v_medium,
        easier_clue = v_easier,
        source_clue_set_id = nullif(v_item ->> 'sourceClueSetId', '')::uuid,
        updated_by = v_admin_id
    from public.puzzle_words w
    where w.id = c.puzzle_word_id
      and w.puzzle_id = p_puzzle_id
      and c.puzzle_word_id = nullif(v_item ->> 'wordId', '')::uuid;

    if not found then
      -- The word list was regenerated (grid Done) since the page loaded.
      raise exception 'The word list has changed. Reload the page to see the latest words.'
        using errcode = 'serialization_failure';
    end if;
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
