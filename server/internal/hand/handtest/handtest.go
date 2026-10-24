// Package handtest はテスト用に、メモリ上にハンドを保存する Store を提供する。
// 本番の PgStore と同じく、ユーザーIDで絞り込み、他人のハンドには触れない。
package handtest

import (
	"context"
	"slices"
	"sync"
	"time"

	"github.com/kashmii/poker_hand_text_generator_app/server/internal/hand"
)

type row struct {
	userID string
	hand   hand.Hand
}

// MemStore はメモリ上の Store。
type MemStore struct {
	mu   sync.Mutex
	rows map[string]row // key: ハンドID
	now  func() time.Time
}

// NewMemStore は空の MemStore を作る。
func NewMemStore() *MemStore {
	return &MemStore{rows: map[string]row{}, now: time.Now}
}

func (s *MemStore) List(ctx context.Context, userID string) ([]hand.Summary, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []hand.Summary
	for _, r := range s.rows {
		if r.userID == userID {
			out = append(out, r.hand.Summary)
		}
	}
	// 新しい順
	slices.SortFunc(out, func(a, b hand.Summary) int { return b.CreatedAt.Compare(a.CreatedAt) })
	return out, nil
}

func (s *MemStore) Get(ctx context.Context, userID, id string) (hand.Hand, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.rows[id]
	if !ok || r.userID != userID {
		return hand.Hand{}, hand.ErrNotFound
	}
	return r.hand, nil
}

func (s *MemStore) Upsert(ctx context.Context, userID string, in hand.Input) (hand.Summary, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	r, exists := s.rows[in.ID]
	if exists && r.userID != userID {
		return hand.Summary{}, hand.ErrNotFound
	}
	createdAt := now
	if exists {
		createdAt = r.hand.CreatedAt
	}
	h := hand.Hand{
		Summary: hand.Summary{
			ID: in.ID, Title: in.Title, VenueName: in.VenueName, PlayedOn: in.PlayedOn,
			CreatedAt: createdAt, UpdatedAt: now,
		},
		Data: in.Data,
	}
	s.rows[in.ID] = row{userID: userID, hand: h}
	return h.Summary, nil
}

func (s *MemStore) Delete(ctx context.Context, userID, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.rows[id]
	if !ok || r.userID != userID {
		return hand.ErrNotFound
	}
	delete(s.rows, id)
	return nil
}
