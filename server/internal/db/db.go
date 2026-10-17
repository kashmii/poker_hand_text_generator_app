// Package db は Postgres（Supabase）への接続プールを作る。
package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool は接続文字列から接続プールを作る。
// 実際の接続は最初に使われたときに行われるので、DB が落ちていても起動はできる。
func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		// 接続文字列にはパスワードが含まれるので、元の文字列はエラーに含めない
		return nil, fmt.Errorf("parse DATABASE_URL: invalid format")
	}

	// Cloud Run は最大1台・少人数利用なので接続数は少なくてよい
	cfg.MaxConns = 4
	// アクセスがない間は接続を閉じて、Supabase 側の接続枠を空けておく
	cfg.MinConns = 0
	cfg.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	return pool, nil
}
