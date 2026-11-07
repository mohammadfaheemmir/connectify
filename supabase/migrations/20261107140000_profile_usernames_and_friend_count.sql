-- Profiles: give every new user a unique username, enforce the username
-- format, and expose a friend count that works for any profile.
--
-- Before: handle_new_user() created profiles with no username, but the
-- Profile page requires one. friend_requests rows are only visible to the
-- two people involved, so other users' friend counts couldn't be shown.

begin;

-- 1. Build a unique username from a name or email: lowercase letters,
--    digits, "." and "_", 3-20 characters, with a number added if taken.
create or replace function public.generate_username(base text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
    clean text;
    candidate text;
    n int := 1;
begin
    clean := lower(regexp_replace(coalesce(base, ''), '[^a-zA-Z0-9._]', '', 'g'));
    clean := regexp_replace(clean, '^[._]+|[._]+$', '', 'g');
    if length(clean) < 3 then
        clean := 'user' || clean;
    end if;
    clean := left(clean, 16);
    candidate := clean;

    while exists (select 1 from public.profiles where username = candidate) loop
        n := n + 1;
        candidate := clean || n::text;
    end loop;

    return candidate;
end;
$$;

revoke execute on function public.generate_username(text) from public, anon, authenticated;

-- 2. New users get a username straight away.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
    display_name text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
    base text := coalesce(
        nullif(replace(display_name, ' ', ''), ''),
        split_part(coalesce(new.email, ''), '@', 1)
    );
    chosen text;
begin
    chosen := public.generate_username(base);

    begin
        insert into public.profiles (id, full_name, username)
        values (new.id, display_name, chosen);
    exception when unique_violation then
        -- Another signup took the same name at the same moment.
        insert into public.profiles (id, full_name, username)
        values (new.id, display_name, left(chosen, 15) || floor(random() * 90000 + 10000)::int::text);
    end;

    return new;
end;
$$;

-- 3. Backfill anyone still missing a username.
do $$
declare
    r record;
begin
    for r in
        select p.id, p.full_name, u.email
        from public.profiles p
        join auth.users u on u.id = p.id
        where p.username is null or p.username = ''
    loop
        update public.profiles
        set username = public.generate_username(
            coalesce(nullif(replace(r.full_name, ' ', ''), ''), split_part(coalesce(r.email, ''), '@', 1))
        )
        where id = r.id;
    end loop;
end;
$$;

-- 4. Enforce the username format the app now validates.
alter table public.profiles
    drop constraint if exists profiles_username_format;
alter table public.profiles
    add constraint profiles_username_format
    check (username ~ '^[a-z0-9._]{3,20}$');

-- 5. Friend count for any user, without exposing who the friends are.
create or replace function public.friend_count(target uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $$
    select count(*)::int
    from public.friend_requests
    where status = 'accepted'
      and (sender_id = target or receiver_id = target);
$$;

revoke execute on function public.friend_count(uuid) from public, anon;
grant execute on function public.friend_count(uuid) to authenticated;

commit;
