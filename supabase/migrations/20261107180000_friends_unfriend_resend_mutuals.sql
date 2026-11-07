-- Friends: unfriending, resending after a decline, cleaning up two-way
-- requests, mutual-friend counts and suggestions, and live updates.
--
-- Before:
-- * Only pending requests could be deleted, so an accepted friendship
--   could never be removed (no unfriend).
-- * UNIQUE (sender_id, receiver_id) plus "only pending can be deleted"
--   meant a declined sender could never ask again.
-- * If two people requested each other, accepting one left the other
--   pending forever.
-- * friend_requests is only visible to the two people involved, so the
--   app couldn't count mutual friends.

begin;

-- 1. Record when a request was answered.
alter table public.friend_requests
    add column if not exists responded_at timestamptz;

create or replace function public.set_friend_request_responded_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
    if new.status is distinct from old.status and new.status in ('accepted', 'rejected') then
        new.responded_at := now();
    end if;
    return new;
end;
$$;

drop trigger if exists on_friend_request_responded on public.friend_requests;
create trigger on_friend_request_responded
    before update on public.friend_requests
    for each row execute function public.set_friend_request_responded_at();

-- 2. Either friend can end an accepted friendship (unfriend).
drop policy if exists "Friends can remove a friendship" on public.friend_requests;
create policy "Friends can remove a friendship"
    on public.friend_requests
    for delete
    using (
        status = 'accepted'
        and (auth.uid() = sender_id or auth.uid() = receiver_id)
    );

-- 3. A sender can clear their own declined request 30 days after it was
--    declined, so they can ask again.
drop policy if exists "Senders can clear an old declined request" on public.friend_requests;
create policy "Senders can clear an old declined request"
    on public.friend_requests
    for delete
    using (
        auth.uid() = sender_id
        and status = 'rejected'
        and coalesce(responded_at, created_at) < now() - interval '30 days'
    );

-- 4. Accepting a request removes any request in the opposite direction.
create or replace function public.remove_reverse_friend_request()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
    if new.status = 'accepted' and old.status is distinct from 'accepted' then
        delete from public.friend_requests
        where sender_id = new.receiver_id
          and receiver_id = new.sender_id
          and id <> new.id;
    end if;
    return new;
end;
$$;

drop trigger if exists on_friend_request_accepted_cleanup on public.friend_requests;
create trigger on_friend_request_accepted_cleanup
    after update on public.friend_requests
    for each row execute function public.remove_reverse_friend_request();

-- 5. Mutual friend counts between the signed-in user and the given users.
create or replace function public.mutual_friend_counts(targets uuid[])
returns table (user_id uuid, mutual integer)
language sql
stable
security definer
set search_path to ''
as $$
    with my_friends as (
        select case when fr.sender_id = auth.uid() then fr.receiver_id else fr.sender_id end as friend_id
        from public.friend_requests fr
        where fr.status = 'accepted'
          and auth.uid() in (fr.sender_id, fr.receiver_id)
    ),
    their_friends as (
        select t.target_id,
               case when fr.sender_id = t.target_id then fr.receiver_id else fr.sender_id end as friend_id
        from unnest(targets) as t(target_id)
        join public.friend_requests fr
          on fr.status = 'accepted'
         and t.target_id in (fr.sender_id, fr.receiver_id)
    )
    select tf.target_id, count(*)::int
    from their_friends tf
    join my_friends mf on mf.friend_id = tf.friend_id
    group by tf.target_id;
$$;

-- 6. Friends of friends the signed-in user has no request with yet.
create or replace function public.friend_suggestions(max_results integer default 12)
returns table (user_id uuid, mutual integer)
language sql
stable
security definer
set search_path to ''
as $$
    with my_friends as (
        select case when fr.sender_id = auth.uid() then fr.receiver_id else fr.sender_id end as friend_id
        from public.friend_requests fr
        where fr.status = 'accepted'
          and auth.uid() in (fr.sender_id, fr.receiver_id)
    ),
    connected as (
        select case when fr.sender_id = auth.uid() then fr.receiver_id else fr.sender_id end as other_id
        from public.friend_requests fr
        where auth.uid() in (fr.sender_id, fr.receiver_id)
    ),
    candidates as (
        select case when fr.sender_id = mf.friend_id then fr.receiver_id else fr.sender_id end as candidate_id
        from my_friends mf
        join public.friend_requests fr
          on fr.status = 'accepted'
         and mf.friend_id in (fr.sender_id, fr.receiver_id)
    )
    select c.candidate_id, count(*)::int as mutual
    from candidates c
    where c.candidate_id <> auth.uid()
      and c.candidate_id not in (select other_id from connected)
    group by c.candidate_id
    order by mutual desc
    limit greatest(1, least(max_results, 50));
$$;

revoke execute on function public.mutual_friend_counts(uuid[]) from public, anon;
grant execute on function public.mutual_friend_counts(uuid[]) to authenticated;
revoke execute on function public.friend_suggestions(integer) from public, anon;
grant execute on function public.friend_suggestions(integer) to authenticated;

-- 7. Live updates for friend requests (Row Level Security still applies).
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_requests'
    ) then
        alter publication supabase_realtime add table public.friend_requests;
    end if;
end;
$$;

commit;
