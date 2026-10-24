package auth_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/kashmii/poker_hand_text_generator_app/server/internal/auth"
	"github.com/kashmii/poker_hand_text_generator_app/server/internal/auth/authtest"
)

const userID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b"

func TestVerify(t *testing.T) {
	iss := authtest.New(t, authtest.DefaultIssuer)
	other := authtest.New(t, authtest.DefaultIssuer) // 別の鍵（偽造の想定）
	v := iss.Verifier()

	modified := func(edit func(c jwt.MapClaims)) string {
		c := iss.Claims(userID)
		edit(c)
		return iss.Sign(t, c)
	}

	tests := []struct {
		name    string
		token   string
		wantErr bool
	}{
		{"正常", iss.Token(t, userID), false},
		{"期限切れ", modified(func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Minute).Unix() }), true},
		{"期限なし", modified(func(c jwt.MapClaims) { delete(c, "exp") }), true},
		{"時計のずれ（30秒以内）は許す", modified(func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-10 * time.Second).Unix() }), false},
		{"別の鍵で署名（偽造）", other.Token(t, userID), true},
		{"発行元が違う", modified(func(c jwt.MapClaims) { c["iss"] = "https://evil.supabase.co/auth/v1" }), true},
		{"対象が違う（anon など）", modified(func(c jwt.MapClaims) { c["aud"] = "anon" }), true},
		{"sub なし", modified(func(c jwt.MapClaims) { delete(c, "sub") }), true},
		{"sub が UUID でない", modified(func(c jwt.MapClaims) { c["sub"] = "' OR 1=1 --" }), true},
		{"HS256（共通鍵）で署名", signHS256(t, iss.Claims(userID)), true},
		{"署名なし（alg: none）", signNone(t, iss.Claims(userID)), true},
		{"JWT の形をしていない", "not-a-jwt", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := v.Verify(tt.token)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("Verify() = %q, want error", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("Verify() error = %v", err)
			}
			if got != userID {
				t.Errorf("Verify() = %q, want %q", got, userID)
			}
		})
	}
}

func TestMiddleware(t *testing.T) {
	iss := authtest.New(t, authtest.DefaultIssuer)

	// 次のハンドラーに届いたユーザーIDをそのまま返す
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := auth.UserID(r.Context())
		if !ok {
			t.Error("user id not in context")
		}
		_, _ = w.Write([]byte(id))
	})
	h := iss.Verifier().Middleware(next)

	tests := []struct {
		name       string
		header     string
		wantStatus int
		wantBody   string
	}{
		{"正しいトークン", "Bearer " + iss.Token(t, userID), http.StatusOK, userID},
		{"bearer は小文字でもよい", "bearer " + iss.Token(t, userID), http.StatusOK, userID},
		{"ヘッダーなし", "", http.StatusUnauthorized, "{\"error\":\"unauthorized\"}\n"},
		{"Bearer 以外の方式", "Basic dXNlcjpwYXNz", http.StatusUnauthorized, "{\"error\":\"unauthorized\"}\n"},
		{"トークンが空", "Bearer ", http.StatusUnauthorized, "{\"error\":\"unauthorized\"}\n"},
		{"不正なトークン", "Bearer not-a-jwt", http.StatusUnauthorized, "{\"error\":\"unauthorized\"}\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/me", nil)
			if tt.header != "" {
				req.Header.Set("Authorization", tt.header)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if got := rec.Body.String(); got != tt.wantBody {
				t.Errorf("body = %q, want %q", got, tt.wantBody)
			}
			if tt.wantStatus == http.StatusUnauthorized && rec.Header().Get("WWW-Authenticate") != "Bearer" {
				t.Error("WWW-Authenticate header is missing")
			}
		})
	}
}

// 本番と同じく、公開鍵の一覧（JWKS）を HTTP で取りに行く経路を確かめる
func TestNewSupabaseVerifier(t *testing.T) {
	var iss *authtest.Issuer
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(iss.JWKS(t))
	}))
	defer srv.Close()
	// Supabase と同じく、発行元は <プロジェクトURL>/auth/v1
	iss = authtest.New(t, srv.URL+"/auth/v1")

	v, err := auth.NewSupabaseVerifier(t.Context(), srv.URL+"/") // 末尾のスラッシュは無視される
	if err != nil {
		t.Fatalf("NewSupabaseVerifier() error = %v", err)
	}

	got, err := v.Verify(iss.Token(t, userID))
	if err != nil {
		t.Fatalf("Verify() error = %v", err)
	}
	if got != userID {
		t.Errorf("Verify() = %q, want %q", got, userID)
	}

	// 同じ JWKS でも、発行元が違うトークンは通さない
	other := authtest.New(t, authtest.DefaultIssuer)
	if _, err := v.Verify(other.Token(t, userID)); err == nil {
		t.Error("token from another issuer was accepted")
	}
}

func TestUserIDNotSet(t *testing.T) {
	if _, ok := auth.UserID(context.Background()); ok {
		t.Error("UserID() ok = true for empty context")
	}
}

func signHS256(t *testing.T, c jwt.MapClaims) string {
	t.Helper()
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString([]byte("guessed-secret"))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func signNone(t *testing.T, c jwt.MapClaims) string {
	t.Helper()
	s, err := jwt.NewWithClaims(jwt.SigningMethodNone, c).SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatal(err)
	}
	return s
}
