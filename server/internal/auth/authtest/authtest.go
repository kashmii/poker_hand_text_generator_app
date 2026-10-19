// Package authtest はテスト用に Supabase と同じ形式の JWT を発行する。
// 本番コードからは使わない。
package authtest

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/kashmii/poker_hand_text_generator_app/server/internal/auth"
)

// DefaultIssuer はテスト用の発行元（iss）。
const DefaultIssuer = "https://test-project.supabase.co/auth/v1"

// Issuer はテスト用の鍵ペアを持ち、JWT を発行する（Supabase Auth の代わり）。
type Issuer struct {
	key    *ecdsa.PrivateKey
	kid    string
	issuer string
}

// New はテスト用の鍵ペア（ES256）を作る。
func New(t testing.TB, issuer string) *Issuer {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	return &Issuer{key: key, kid: "test-key", issuer: issuer}
}

// Claims は正常なログイン済みユーザーの claims を返す。テストで一部を書き換えて使う。
func (i *Issuer) Claims(userID string) jwt.MapClaims {
	now := time.Now()
	return jwt.MapClaims{
		"sub":  userID,
		"aud":  auth.Audience,
		"iss":  i.issuer,
		"iat":  now.Unix(),
		"exp":  now.Add(time.Hour).Unix(),
		"role": "authenticated",
	}
}

// Sign は claims に署名して JWT 文字列を返す。
func (i *Issuer) Sign(t testing.TB, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	token.Header["kid"] = i.kid
	s, err := token.SignedString(i.key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return s
}

// Token は userID の正常な JWT を返す。
func (i *Issuer) Token(t testing.TB, userID string) string {
	t.Helper()
	return i.Sign(t, i.Claims(userID))
}

// Verifier はこの鍵で署名された JWT を検証する Verifier を返す。
func (i *Issuer) Verifier() *auth.Verifier {
	return auth.NewVerifier(func(token *jwt.Token) (any, error) {
		if token.Header["kid"] != i.kid {
			return nil, errors.New("unknown kid")
		}
		return &i.key.PublicKey, nil
	}, i.issuer)
}

// JWKS は公開鍵の一覧を Supabase と同じ JSON 形式で返す。
func (i *Issuer) JWKS(t testing.TB) []byte {
	t.Helper()
	pub, err := i.key.PublicKey.ECDH()
	if err != nil {
		t.Fatalf("public key: %v", err)
	}
	b := pub.Bytes() // 0x04 || X(32バイト) || Y(32バイト)
	enc := base64.RawURLEncoding.EncodeToString
	jwks, err := json.Marshal(map[string]any{
		"keys": []map[string]string{{
			"kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig",
			"kid": i.kid, "x": enc(b[1:33]), "y": enc(b[33:65]),
		}},
	})
	if err != nil {
		t.Fatalf("marshal jwks: %v", err)
	}
	return jwks
}
