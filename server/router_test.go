package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/kashmii/poker_hand_text_generator_app/server/internal/auth/authtest"
)

// fakeDB は Ping の結果を固定で返す偽の DB
type fakeDB struct{ err error }

func (f fakeDB) Ping(ctx context.Context) error { return f.err }

// testRouter はテスト用の鍵で JWT を検証するルーターを返す
func testRouter(t *testing.T, allowedOrigins []string, db pinger) (http.Handler, *authtest.Issuer) {
	t.Helper()
	iss := authtest.New(t, authtest.DefaultIssuer)
	return newRouter(allowedOrigins, db, iss.Verifier().Middleware), iss
}

func TestHealth(t *testing.T) {
	tests := []struct {
		name       string
		db         fakeDB
		wantStatus int
		wantBody   string
	}{
		{"DBにつながる", fakeDB{}, http.StatusOK, "{\"db\":\"ok\",\"status\":\"ok\"}\n"},
		{"DBにつながらない", fakeDB{err: errors.New("connection refused")}, http.StatusServiceUnavailable, "{\"db\":\"error\",\"status\":\"ng\"}\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h, _ := testRouter(t, nil, tt.db)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))

			if rec.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if got := rec.Body.String(); got != tt.wantBody {
				t.Errorf("body = %q, want %q", got, tt.wantBody)
			}
		})
	}
}

func TestHealthRejectsOtherMethods(t *testing.T) {
	h, _ := testRouter(t, nil, fakeDB{})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/health", nil))

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}
}

func TestCORS(t *testing.T) {
	allowed := "https://allowed.example.com"
	h, _ := testRouter(t, []string{allowed}, fakeDB{})

	tests := []struct {
		name       string
		origin     string
		wantHeader string
	}{
		{"許可したオリジン", allowed, allowed},
		{"許可していないオリジン", "https://evil.example.com", ""},
		{"Originなし（curlなど）", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/health", nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)

			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != tt.wantHeader {
				t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, tt.wantHeader)
			}
		})
	}
}

func TestCORSPreflight(t *testing.T) {
	allowed := "https://allowed.example.com"
	h, _ := testRouter(t, []string{allowed}, fakeDB{})

	req := httptest.NewRequest(http.MethodOptions, "/health", nil)
	req.Header.Set("Origin", allowed)
	req.Header.Set("Access-Control-Request-Method", http.MethodGet)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != allowed {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, allowed)
	}
}

func TestParseOrigins(t *testing.T) {
	got := parseOrigins(" http://localhost:5173 , https://a.vercel.app,,")
	want := []string{"http://localhost:5173", "https://a.vercel.app"}
	if !slices.Equal(got, want) {
		t.Errorf("parseOrigins = %v, want %v", got, want)
	}
}

func TestMe(t *testing.T) {
	const userID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b"
	allowed := "https://allowed.example.com"
	h, iss := testRouter(t, []string{allowed}, fakeDB{})

	t.Run("ログイン済み", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/me", nil)
		req.Header.Set("Authorization", "Bearer "+iss.Token(t, userID))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
		}
		if got, want := rec.Body.String(), "{\"userId\":\""+userID+"\"}\n"; got != want {
			t.Errorf("body = %q, want %q", got, want)
		}
	})

	t.Run("未ログインは401。ブラウザが読めるようCORSヘッダーは付く", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/me", nil)
		req.Header.Set("Origin", allowed)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != allowed {
			t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, allowed)
		}
	})

	t.Run("プリフライトはトークンなしで通す", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/me", nil)
		req.Header.Set("Origin", allowed)
		req.Header.Set("Access-Control-Request-Method", http.MethodGet)
		req.Header.Set("Access-Control-Request-Headers", "authorization")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if rec.Code != http.StatusNoContent {
			t.Errorf("status = %d, want %d", rec.Code, http.StatusNoContent)
		}
	})
}
