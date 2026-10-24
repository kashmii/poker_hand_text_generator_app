// Package hand はハンドの保存・取得・削除を扱う。
// どの操作も、JWT から取り出したユーザーIDで絞り込み、他人のハンドには触れない。
package hand

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

// ErrNotFound は、ハンドが存在しないか、他人のハンドであることを表す。
// 他人のハンドがあることも教えないため、両者を区別しない。
var ErrNotFound = errors.New("hand not found")

// Summary は一覧表示用のハンドの概要。
type Summary struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	VenueName string    `json:"venueName"`
	PlayedOn  *string   `json:"playedOn"` // YYYY-MM-DD。不明なら null
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	// 一覧でハンドを見分けやすくするための抜粋（List のときだけ data から取り出して入れる）。
	// HeroHoleCards はヒーローのホールカード（[{rank,suit},...] か null）、
	// Board は flop/turn/river を連結した全ボード。Get/Upsert では空のまま。
	HeroHoleCards json.RawMessage `json:"heroHoleCards,omitempty"`
	Board         json.RawMessage `json:"board,omitempty"`
}

// Hand はハンド1件。Data にフロントの HandData を丸ごと持つ。
type Hand struct {
	Summary
	Data json.RawMessage `json:"data"`
}

// Input は保存するハンドの内容。ユーザーIDは含めない（必ず JWT から取る）。
type Input struct {
	ID        string
	Title     string
	VenueName string
	PlayedOn  *string
	Data      json.RawMessage
}

// Store はハンドの保存先。本番は Postgres、テストは handtest の偽物を使う。
type Store interface {
	// List はユーザーのハンドの概要を新しい順に返す。
	List(ctx context.Context, userID string) ([]Summary, error)
	// Get はユーザーのハンド1件を返す。なければ ErrNotFound。
	Get(ctx context.Context, userID, id string) (Hand, error)
	// Upsert はハンドを作成または更新する。同じIDの他人のハンドがあれば ErrNotFound。
	Upsert(ctx context.Context, userID string, in Input) (Summary, error)
	// Delete はユーザーのハンドを削除する。なければ ErrNotFound。
	Delete(ctx context.Context, userID, id string) error
}
