package hand

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// listLimit は一覧で返す最大件数。増えてきたらページ送りを入れる
const listLimit = 500

// PgStore は Postgres（Supabase）にハンドを保存する。
// すべての SQL に user_id の条件を入れ、他人の行には触れない。
type PgStore struct {
	pool *pgxpool.Pool
}

// NewPgStore は接続プールを使う Store を作る。
func NewPgStore(pool *pgxpool.Pool) *PgStore {
	return &PgStore{pool: pool}
}

// played_on は date 型。文字列（YYYY-MM-DD）でやり取りする
const summaryColumns = `id, title, venue_name, played_on::text, created_at, updated_at`

// listColumns は一覧用。概要に加えて、一覧でハンドを見分けられるよう
// data(JSONB) からヒーローのホールカードと全ボード（flop+turn+river）を取り出す。
// キーが無いハンドでも null / [] になるよう coalesce する。
const listColumns = summaryColumns + `,
	coalesce(data->'heroHoleCards', 'null'::jsonb),
	coalesce(data#>'{streets,flop,board}', '[]'::jsonb)
		|| coalesce(data#>'{streets,turn,board}', '[]'::jsonb)
		|| coalesce(data#>'{streets,river,board}', '[]'::jsonb)`

func (s *PgStore) List(ctx context.Context, userID string) ([]Summary, error) {
	rows, err := s.pool.Query(ctx, `
		select `+listColumns+`
		from hands
		where user_id = $1
		order by created_at desc
		limit $2`, userID, listLimit)
	if err != nil {
		return nil, fmt.Errorf("list hands: %w", err)
	}
	summaries, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Summary, error) {
		var h Summary
		err := row.Scan(&h.ID, &h.Title, &h.VenueName, &h.PlayedOn, &h.CreatedAt, &h.UpdatedAt,
			&h.HeroHoleCards, &h.Board)
		return h, err
	})
	if err != nil {
		return nil, fmt.Errorf("list hands: %w", err)
	}
	return summaries, nil
}

func (s *PgStore) Get(ctx context.Context, userID, id string) (Hand, error) {
	var h Hand
	err := s.pool.QueryRow(ctx, `
		select `+summaryColumns+`, data
		from hands
		where user_id = $1 and id = $2`, userID, id,
	).Scan(&h.ID, &h.Title, &h.VenueName, &h.PlayedOn, &h.CreatedAt, &h.UpdatedAt, &h.Data)
	if errors.Is(err, pgx.ErrNoRows) {
		return Hand{}, ErrNotFound
	}
	if err != nil {
		return Hand{}, fmt.Errorf("get hand: %w", err)
	}
	return h, nil
}

func (s *PgStore) Upsert(ctx context.Context, userID string, in Input) (Summary, error) {
	var h Summary
	// 作成と更新を1つの SQL で行う。
	// 同じIDの行が他人のものなら where で更新されず、何も返らない → ErrNotFound
	err := s.pool.QueryRow(ctx, `
		insert into hands (id, user_id, title, venue_name, played_on, data)
		values ($1, $2, $3, $4, $5::date, $6)
		on conflict (id) do update
			set title = excluded.title,
			    venue_name = excluded.venue_name,
			    played_on = excluded.played_on,
			    data = excluded.data,
			    updated_at = now()
			where hands.user_id = excluded.user_id
		returning `+summaryColumns,
		in.ID, userID, in.Title, in.VenueName, in.PlayedOn, string(in.Data),
	).Scan(&h.ID, &h.Title, &h.VenueName, &h.PlayedOn, &h.CreatedAt, &h.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Summary{}, ErrNotFound
	}
	if err != nil {
		return Summary{}, fmt.Errorf("upsert hand: %w", err)
	}
	return h, nil
}

func (s *PgStore) Delete(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx, `delete from hands where user_id = $1 and id = $2`, userID, id)
	if err != nil {
		return fmt.Errorf("delete hand: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
