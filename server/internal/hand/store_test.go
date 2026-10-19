package hand_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kashmii/poker_hand_text_generator_app/server/internal/hand"
)

// PgStore のテストは、本物の Postgres に SQL を流して確かめる。
// TEST_DATABASE_URL を指定したときだけ動く（README の「Store のテスト」を参照）。
// テーブルを作り直すので、本番の Supabase には絶対に向けない。
func newTestPgStore(t *testing.T) *hand.PgStore {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	if strings.Contains(url, "supabase") {
		t.Fatal("TEST_DATABASE_URL points to Supabase; use a local database")
	}
	ctx := t.Context()
	pool, err := connectPool(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)

	// Supabase にあるもの（auth.users と公開API用のロール）を最小限で用意し、マイグレーションを流し直す
	exec(t, pool, `
		create schema if not exists auth;
		create table if not exists auth.users (id uuid primary key);
		do $$ begin
			if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
			if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
		end $$;
		drop table if exists public.hands;`)
	files, err := filepath.Glob("../../migrations/*.sql")
	if err != nil || len(files) == 0 {
		t.Fatalf("migrations not found: %v", err)
	}
	slices.Sort(files)
	for _, f := range files {
		sql, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		exec(t, pool, string(sql))
	}
	exec(t, pool, `insert into auth.users (id) values ('`+userA+`'), ('`+userB+`') on conflict do nothing`)
	return hand.NewPgStore(pool)
}

func connectPool(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	return pool, pool.Ping(ctx)
}

func exec(t *testing.T, pool *pgxpool.Pool, sql string) {
	t.Helper()
	if _, err := pool.Exec(t.Context(), sql); err != nil {
		t.Fatalf("exec %q: %v", sql, err)
	}
}

func input(id, title, data string) hand.Input {
	return hand.Input{ID: id, Title: title, VenueName: "Hiro Poker", Data: json.RawMessage(data)}
}

// jsonb はキーの順番や空白を整えて保存するので、中身が同じかで比べる
func sameJSON(t *testing.T, a, b []byte) bool {
	t.Helper()
	var x, y any
	if err := json.Unmarshal(a, &x); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &y); err != nil {
		t.Fatal(err)
	}
	return reflect.DeepEqual(x, y)
}

func TestPgStore(t *testing.T) {
	s := newTestPgStore(t)
	ctx := t.Context()
	data := handData(handID, "KKで勝ち", "Hiro Poker", "2026-10-19")
	date := "2026-10-19"

	// 作成
	in := input(handID, "KKで勝ち", data)
	in.PlayedOn = &date
	created, err := s.Upsert(ctx, userA, in)
	if err != nil {
		t.Fatalf("Upsert(create) error = %v", err)
	}
	if created.PlayedOn == nil || *created.PlayedOn != date || created.Title != "KKで勝ち" {
		t.Errorf("created = %+v", created)
	}

	// 取得: data の中身が保たれている
	got, err := s.Get(ctx, userA, handID)
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if !sameJSON(t, got.Data, []byte(data)) {
		t.Errorf("data = %s, want %s", got.Data, data)
	}

	// 更新: 作成日時は変わらず、更新日時は進む
	updated, err := s.Upsert(ctx, userA, input(handID, "KKで勝ち（修正）", data))
	if err != nil {
		t.Fatalf("Upsert(update) error = %v", err)
	}
	if updated.Title != "KKで勝ち（修正）" || updated.PlayedOn != nil {
		t.Errorf("updated = %+v", updated)
	}
	if !updated.CreatedAt.Equal(created.CreatedAt) || !updated.UpdatedAt.After(created.UpdatedAt) {
		t.Errorf("timestamps: created %v/%v, updated %v/%v",
			created.CreatedAt, created.UpdatedAt, updated.CreatedAt, updated.UpdatedAt)
	}

	// 他人（B）からは、取得・上書き・削除のどれもできない
	if _, err := s.Get(ctx, userB, handID); !errors.Is(err, hand.ErrNotFound) {
		t.Errorf("Get by other user: err = %v, want ErrNotFound", err)
	}
	if _, err := s.Upsert(ctx, userB, input(handID, "乗っ取り", `{}`)); !errors.Is(err, hand.ErrNotFound) {
		t.Errorf("Upsert by other user: err = %v, want ErrNotFound", err)
	}
	if err := s.Delete(ctx, userB, handID); !errors.Is(err, hand.ErrNotFound) {
		t.Errorf("Delete by other user: err = %v, want ErrNotFound", err)
	}
	if got, _ := s.Get(ctx, userA, handID); got.Title != "KKで勝ち（修正）" {
		t.Errorf("userA's hand was changed by userB: %+v", got.Summary)
	}

	// 一覧: 自分のハンドだけ、新しい順
	id2 := "11111111-0000-4000-8000-000000000002"
	if _, err := s.Upsert(ctx, userA, input(id2, "2つ目", `{}`)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Upsert(ctx, userB, input("bbbbbbbb-1111-4000-8000-000000000000", "Bさんのハンド", `{}`)); err != nil {
		t.Fatal(err)
	}
	list, err := s.List(ctx, userA)
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(list) != 2 || list[0].ID != id2 || list[1].ID != handID {
		t.Errorf("List(userA) = %+v", list)
	}

	// 削除
	if err := s.Delete(ctx, userA, handID); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if _, err := s.Get(ctx, userA, handID); !errors.Is(err, hand.ErrNotFound) {
		t.Errorf("Get after delete: err = %v, want ErrNotFound", err)
	}
	if err := s.Delete(ctx, userA, handID); !errors.Is(err, hand.ErrNotFound) {
		t.Errorf("Delete twice: err = %v, want ErrNotFound", err)
	}

	// auth.users にいないユーザーでは保存できない（外部キー）
	if _, err := s.Upsert(ctx, "cccccccc-0000-4000-8000-000000000003", input("44444444-0000-4000-8000-000000000000", "", `{}`)); err == nil {
		t.Error("Upsert by unknown user succeeded")
	}
}
