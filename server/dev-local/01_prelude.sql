-- 開発用ローカルDBの下地（本番の Supabase には流さない）
-- 素の Postgres に無い Supabase 側のものを最小限で補う
-- 適用順: dev-local/01_prelude.sql → migrations/0001 → dev-local/02_postlude.sql → migrations/0002

-- hands.user_id の参照先（Supabase の auth.users の代わり）
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);

-- 0002 が権限を外す対象のロール
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
