-- Track whether a user has finished (or skipped) the welcome flow.
-- New users get NULL and see onboarding once; everyone who already has an
-- account is marked as onboarded so they never see it.

begin;

alter table public.profiles
    add column if not exists onboarded_at timestamptz;

update public.profiles
set onboarded_at = coalesce(created_at, now())
where onboarded_at is null;

commit;
