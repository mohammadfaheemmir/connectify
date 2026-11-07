-- Let a signed-in user delete their own account.
--
-- Every table that references auth.users (profiles, posts, comments, likes,
-- messages, conversations, conversation_members, friend_requests,
-- notifications) uses ON DELETE CASCADE, so removing the auth user removes
-- their data. Uploaded files are removed by the app before calling this.

begin;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
    uid uuid := auth.uid();
begin
    if uid is null then
        raise exception 'not_authenticated' using errcode = '42501';
    end if;

    delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

commit;
