-- ハンド保存用テーブル
-- 適用: psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f migrations/0001_create_hands.sql

create table public.hands (
  id          uuid primary key,                 -- フロントで作ったUUID
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  venue_name  text not null default '',
  played_on   date,                             -- セッションの日付
  data        jsonb not null,                   -- HandData を丸ごと
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 一覧表示（自分のハンドを新しい順）用
create index hands_user_created_idx on public.hands (user_id, created_at desc);

-- 念のための二重の守り（Data API は無効にしているが、万一に備える）
-- Go はテーブルの所有者（postgres）として接続するので、RLS の影響を受けない
alter table public.hands enable row level security;
