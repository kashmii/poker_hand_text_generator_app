package hand_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kashmii/poker_hand_text_generator_app/server/internal/auth/authtest"
	"github.com/kashmii/poker_hand_text_generator_app/server/internal/hand"
	"github.com/kashmii/poker_hand_text_generator_app/server/internal/hand/handtest"
)

const (
	userA  = "aaaaaaaa-0000-4000-8000-000000000001" // あなた
	userB  = "bbbbbbbb-0000-4000-8000-000000000002" // Aさん
	handID = "11111111-2222-4333-8444-555555555555"
)

// handData はフロントの HandData に近い形の本文を返す
func handData(id, title, venue, date string) string {
	return `{"id":"` + id + `","handNumber":1,"title":"` + title + `",` +
		`"session":{"venueName":"` + venue + `","date":"` + date + `","smallBlind":1,"bigBlind":2},` +
		`"streets":{"preflop":{"actions":[]}},"pot":40,"winners":[]}`
}

type testServer struct {
	t   *testing.T
	h   http.Handler
	iss *authtest.Issuer
}

func newTestServer(t *testing.T) *testServer {
	t.Helper()
	iss := authtest.New(t, authtest.DefaultIssuer)
	mux := http.NewServeMux()
	hand.NewHandler(handtest.NewMemStore()).Register(mux, iss.Verifier().Middleware)
	return &testServer{t: t, h: mux, iss: iss}
}

// do は userID としてログインした状態でリクエストする。userID が空ならトークンなし
func (s *testServer) do(userID, method, path, body string) *httptest.ResponseRecorder {
	s.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if userID != "" {
		req.Header.Set("Authorization", "Bearer "+s.iss.Token(s.t, userID))
	}
	rec := httptest.NewRecorder()
	s.h.ServeHTTP(rec, req)
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return v
}

func wantStatus(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, want, rec.Body.String())
	}
}

func TestCreateGetUpdateDelete(t *testing.T) {
	s := newTestServer(t)
	path := "/hands/" + handID
	body := handData(handID, "KKで勝ち", "Hiro Poker", "2026-10-19")

	// 作成
	rec := s.do(userA, http.MethodPut, path, body)
	wantStatus(t, rec, http.StatusOK)
	created := decode[hand.Summary](t, rec)
	if created.ID != handID || created.Title != "KKで勝ち" || created.VenueName != "Hiro Poker" ||
		created.PlayedOn == nil || *created.PlayedOn != "2026-10-19" {
		t.Errorf("created = %+v", created)
	}

	// 取得: 送った本文が data にそのまま入っている
	rec = s.do(userA, http.MethodGet, path, "")
	wantStatus(t, rec, http.StatusOK)
	got := decode[hand.Hand](t, rec)
	if string(got.Data) != body {
		t.Errorf("data = %s, want %s", got.Data, body)
	}

	// 更新（同じIDでもう一度 PUT）: 作成日時は変わらない
	rec = s.do(userA, http.MethodPut, path, handData(handID, "KKで勝ち（修正）", "Hiro Poker", "2026-10-19"))
	wantStatus(t, rec, http.StatusOK)
	updated := decode[hand.Summary](t, rec)
	if updated.Title != "KKで勝ち（修正）" {
		t.Errorf("title = %q", updated.Title)
	}
	if !updated.CreatedAt.Equal(created.CreatedAt) {
		t.Errorf("createdAt changed: %v -> %v", created.CreatedAt, updated.CreatedAt)
	}

	// 一覧: 1件だけ（再送しても二重登録にならない）
	rec = s.do(userA, http.MethodGet, "/hands", "")
	wantStatus(t, rec, http.StatusOK)
	list := decode[struct{ Hands []hand.Summary }](t, rec)
	if len(list.Hands) != 1 || list.Hands[0].Title != "KKで勝ち（修正）" {
		t.Errorf("list = %+v", list.Hands)
	}

	// 削除 → もう取れない → もう一度削除しても 404
	wantStatus(t, s.do(userA, http.MethodDelete, path, ""), http.StatusNoContent)
	wantStatus(t, s.do(userA, http.MethodGet, path, ""), http.StatusNotFound)
	wantStatus(t, s.do(userA, http.MethodDelete, path, ""), http.StatusNotFound)
}

func TestListOrderAndEmpty(t *testing.T) {
	s := newTestServer(t)

	// 0件のときは null ではなく []
	rec := s.do(userA, http.MethodGet, "/hands", "")
	wantStatus(t, rec, http.StatusOK)
	if got := rec.Body.String(); got != "{\"hands\":[]}\n" {
		t.Errorf("empty list body = %q", got)
	}

	ids := []string{
		"11111111-0000-4000-8000-000000000001",
		"11111111-0000-4000-8000-000000000002",
		"11111111-0000-4000-8000-000000000003",
	}
	for i, id := range ids {
		wantStatus(t, s.do(userA, http.MethodPut, "/hands/"+id, handData(id, "hand"+string(rune('1'+i)), "", "")), http.StatusOK)
	}
	list := decode[struct{ Hands []hand.Summary }](t, s.do(userA, http.MethodGet, "/hands", ""))
	if len(list.Hands) != 3 || list.Hands[0].ID != ids[2] || list.Hands[2].ID != ids[0] {
		t.Errorf("list should be newest first: %+v", list.Hands)
	}
}

// 他人のハンドには一切触れられないこと（要求1の中心）
func TestOtherUsersHandsAreInvisible(t *testing.T) {
	s := newTestServer(t)
	path := "/hands/" + handID
	original := handData(handID, "Aさんには見せない", "Hiro Poker", "2026-10-19")
	wantStatus(t, s.do(userA, http.MethodPut, path, original), http.StatusOK)

	// Bさんの一覧には出ない
	list := decode[struct{ Hands []hand.Summary }](t, s.do(userB, http.MethodGet, "/hands", ""))
	if len(list.Hands) != 0 {
		t.Errorf("userB sees %d hands", len(list.Hands))
	}
	// IDを直接指定しても、取得・上書き・削除はすべて 404（存在も教えない）
	wantStatus(t, s.do(userB, http.MethodGet, path, ""), http.StatusNotFound)
	wantStatus(t, s.do(userB, http.MethodPut, path, handData(handID, "乗っ取り", "", "")), http.StatusNotFound)
	wantStatus(t, s.do(userB, http.MethodDelete, path, ""), http.StatusNotFound)

	// A さんのハンドは元のまま
	got := decode[hand.Hand](t, s.do(userA, http.MethodGet, path, ""))
	if string(got.Data) != original {
		t.Errorf("userA's hand was changed: %s", got.Data)
	}
}

func TestRequiresLogin(t *testing.T) {
	s := newTestServer(t)
	for _, tt := range []struct{ method, path string }{
		{http.MethodGet, "/hands"},
		{http.MethodGet, "/hands/" + handID},
		{http.MethodPut, "/hands/" + handID},
		{http.MethodDelete, "/hands/" + handID},
	} {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			wantStatus(t, s.do("", tt.method, tt.path, handData(handID, "", "", "")), http.StatusUnauthorized)
		})
	}
}

func TestBadRequests(t *testing.T) {
	s := newTestServer(t)
	tests := []struct {
		name       string
		method     string
		path       string
		body       string
		wantStatus int
	}{
		{"IDがUUIDでない（取得）", http.MethodGet, "/hands/not-a-uuid", "", http.StatusBadRequest},
		{"IDがUUIDでない（保存）", http.MethodPut, "/hands/123", handData("123", "", "", ""), http.StatusBadRequest},
		{"IDがUUIDでない（削除）", http.MethodDelete, "/hands/abc", "", http.StatusBadRequest},
		{"本文が空", http.MethodPut, "/hands/" + handID, "", http.StatusBadRequest},
		{"本文がJSONでない", http.MethodPut, "/hands/" + handID, "hello", http.StatusBadRequest},
		{"本文が配列", http.MethodPut, "/hands/" + handID, "[]", http.StatusBadRequest},
		{"本文の型が違う（titleが数値）", http.MethodPut, "/hands/" + handID, `{"title":123}`, http.StatusBadRequest},
		{"本文のidがパスと違う", http.MethodPut, "/hands/" + handID, handData("99999999-0000-4000-8000-000000000000", "", "", ""), http.StatusBadRequest},
		{"本文が大きすぎる", http.MethodPut, "/hands/" + handID, `{"title":"` + strings.Repeat("x", 300<<10) + `"}`, http.StatusRequestEntityTooLarge},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wantStatus(t, s.do(userA, tt.method, tt.path, tt.body), tt.wantStatus)
		})
	}
}

func TestPutNormalization(t *testing.T) {
	s := newTestServer(t)

	t.Run("IDの大文字は小文字にそろえる", func(t *testing.T) {
		upper := strings.ToUpper(handID)
		rec := s.do(userA, http.MethodPut, "/hands/"+upper, handData(upper, "", "", ""))
		wantStatus(t, rec, http.StatusOK)
		if got := decode[hand.Summary](t, rec).ID; got != handID {
			t.Errorf("id = %q, want %q", got, handID)
		}
	})

	t.Run("日付として読めない値は null", func(t *testing.T) {
		id := "22222222-0000-4000-8000-000000000000"
		rec := s.do(userA, http.MethodPut, "/hands/"+id, handData(id, "", "", "2026/10/19"))
		wantStatus(t, rec, http.StatusOK)
		if got := decode[hand.Summary](t, rec).PlayedOn; got != nil {
			t.Errorf("playedOn = %q, want nil", *got)
		}
	})

	t.Run("session や id がなくても保存できる", func(t *testing.T) {
		id := "33333333-0000-4000-8000-000000000000"
		rec := s.do(userA, http.MethodPut, "/hands/"+id, `{"title":"メモだけ"}`)
		wantStatus(t, rec, http.StatusOK)
		got := decode[hand.Summary](t, rec)
		if got.Title != "メモだけ" || got.VenueName != "" || got.PlayedOn != nil {
			t.Errorf("summary = %+v", got)
		}
	})
}
