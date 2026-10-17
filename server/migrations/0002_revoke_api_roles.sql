-- Supabase の公開API用ロール（anon / authenticated）から hands への権限を外す
-- hands に触るのは Go（postgres として接続）だけにする。RLS と合わせた二重の守り
-- 適用: psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f migrations/0002_revoke_api_roles.sql

revoke all on table public.hands from anon, authenticated;
