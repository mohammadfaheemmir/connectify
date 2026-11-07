-- Stop stale and duplicate "sent you a friend request" notifications.
--
-- Cause: notify_friend_request() inserted a notification for every new
-- request, and deleting a request (cancel, unfriend, clearing an old
-- declined request) only set notifications.friend_request_id to NULL,
-- so the notification stayed. Send -> cancel -> send again left two
-- notifications for a request that no longer existed.

begin;

-- 1. Deleting a request removes the notifications about it.
create or replace function public.remove_friend_request_notifications()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
    delete from public.notifications
    where friend_request_id = old.id;
    return old;
end;
$$;

drop trigger if exists on_friend_request_deleted_cleanup on public.friend_requests;
create trigger on_friend_request_deleted_cleanup
    before delete on public.friend_requests
    for each row execute function public.remove_friend_request_notifications();

-- 2. A new request replaces any older request notification from the same
--    person, so there is only ever one.
create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if new.status = 'pending' then
        delete from public.notifications
        where type = 'friend_request'
          and recipient_id = new.receiver_id
          and actor_id = new.sender_id;

        insert into public.notifications (recipient_id, actor_id, type, friend_request_id)
        values (new.receiver_id, new.sender_id, 'friend_request', new.id);
    end if;
    return new;
end;
$$;

-- 3. Clean up notifications left behind by requests that no longer exist.
delete from public.notifications
where type in ('friend_request', 'friend_accepted')
  and friend_request_id is null;

commit;
