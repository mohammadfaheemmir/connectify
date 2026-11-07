-- Stop duplicate "liked your post" notifications.
-- Cause: notify_post_like() inserted a new notification on every like, and
-- unliking never removed it, so like -> unlike -> like created duplicates.

begin;

-- 1. Remove existing duplicate like notifications, keeping the newest copy
delete from public.notifications n
using public.notifications m
where n.type = 'like' and m.type = 'like'
  and n.recipient_id = m.recipient_id
  and n.actor_id = m.actor_id
  and n.post_id = m.post_id
  and n.created_at < m.created_at;

-- 2. Only one like notification per person per post
create unique index if not exists notifications_one_like_per_actor_post
  on public.notifications (recipient_id, actor_id, post_id)
  where type = 'like';

-- 3. Like trigger: skip if a like notification already exists
create or replace function public.notify_post_like()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    post_owner uuid;
begin
    select user_id into post_owner from public.posts where id = new.post_id;

    if post_owner is not null and post_owner <> new.user_id then
        insert into public.notifications (recipient_id, actor_id, type, post_id)
        values (post_owner, new.user_id, 'like', new.post_id)
        on conflict (recipient_id, actor_id, post_id) where type = 'like' do nothing;
    end if;

    return new;
end;
$$;

-- 4. Remove the like notification when the like is removed
create or replace function public.remove_post_like_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    delete from public.notifications
    where type = 'like'
      and actor_id = old.user_id
      and post_id = old.post_id;
    return old;
end;
$$;

drop trigger if exists on_post_unlike_notification on public.likes;
create trigger on_post_unlike_notification
    after delete on public.likes
    for each row execute function public.remove_post_like_notification();

commit;
