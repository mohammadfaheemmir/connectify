-- Remove notifications about comments and posts once they are deleted.
--
-- notifications.comment_id and notifications.post_id use ON DELETE SET NULL,
-- so deleting a comment left "X commented on your post", and deleting a post
-- left its like and comment notifications pointing at nothing. Same class of
-- bug as the friend-request notifications fixed in 20261107220000.

begin;

create or replace function public.remove_comment_notifications()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
    delete from public.notifications where comment_id = old.id;
    return old;
end;
$$;

drop trigger if exists on_comment_deleted_cleanup on public.comments;
create trigger on_comment_deleted_cleanup
    before delete on public.comments
    for each row execute function public.remove_comment_notifications();

create or replace function public.remove_post_notifications()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
    delete from public.notifications where post_id = old.id;
    return old;
end;
$$;

drop trigger if exists on_post_deleted_cleanup on public.posts;
create trigger on_post_deleted_cleanup
    before delete on public.posts
    for each row execute function public.remove_post_notifications();

-- Clean up any already left behind.
delete from public.notifications
where (type = 'comment' and (comment_id is null or post_id is null))
   or (type = 'like' and post_id is null);

commit;
