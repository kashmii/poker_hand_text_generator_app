-- 開発用（本番の Supabase には流さない）。migrations/0001 の後に適用する
-- ログインは本番の Supabase なので、JWT のユーザーID はローカルの auth.users に無い
-- hands へ入れる前にそのユーザーを auth.users に用意して、外部キー違反を防ぐ

create or replace function auth.ensure_user() returns trigger
language plpgsql as $$
begin
  insert into auth.users (id) values (new.user_id) on conflict do nothing;
  return new;
end $$;

create trigger hands_ensure_user
  before insert on public.hands
  for each row execute function auth.ensure_user();
