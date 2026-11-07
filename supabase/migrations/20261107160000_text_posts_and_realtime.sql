-- Allow text-only posts and turn on Realtime for the tables the app listens to.
--
-- Before: posts.image_url was NOT NULL, so posts without a photo failed.
-- Only "messages" was in the supabase_realtime publication, so the sidebar
-- notification badge, live notifications, new chats and the "new posts"
-- pill never received updates.

begin;

-- 1. Text-only posts: image is optional, but a post must have a photo or text.
alter table public.posts
    alter column image_url drop not null;

alter table public.posts
    drop constraint if exists posts_has_content;
alter table public.posts
    add constraint posts_has_content
    check (image_url is not null or coalesce(btrim(caption), '') <> '');

-- 2. Realtime for notifications, posts and conversation membership.
--    Row Level Security still decides which rows each user receives.
do $$
declare
    t text;
begin
    foreach t in array array['notifications', 'posts', 'conversation_members'] loop
        if not exists (
            select 1 from pg_publication_tables
            where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
        ) then
            execute format('alter publication supabase_realtime add table public.%I', t);
        end if;
    end loop;
end;
$$;

commit;
