// Package auth は Supabase が発行した JWT を検証し、リクエストしたユーザーのIDを取り出す。
package auth

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"

	"github.com/kashmii/poker_hand_text_generator_app/server/internal/httpjson"
)

// Audience はログイン済みユーザーの JWT に入る aud（対象）。
const Audience = "authenticated"

// Supabase の公開鍵方式の署名鍵で使われるアルゴリズム。
// HS256（共通鍵）や none を受け付けると偽造されうるので、ここに挙げたものだけ通す
var validMethods = []string{"ES256", "RS256"}

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// Verifier は JWT の署名・有効期限・発行元・対象を検証する。
type Verifier struct {
	keyfunc jwt.Keyfunc
	issuer  string
}

// NewSupabaseVerifier は Supabase の公開鍵一覧（JWKS）を使う Verifier を作る。
// supabaseURL は https://<プロジェクトID>.supabase.co の形。
// 公開鍵は起動時に取得し、その後は1時間ごとに更新する（ctx が終わると更新を止める）。
// 起動時の取得に失敗しても起動はでき、次の検証時に取り直す。
func NewSupabaseVerifier(ctx context.Context, supabaseURL string) (*Verifier, error) {
	base := strings.TrimRight(supabaseURL, "/")
	k, err := keyfunc.NewDefaultCtx(ctx, []string{base + "/auth/v1/.well-known/jwks.json"})
	if err != nil {
		return nil, fmt.Errorf("jwks: %w", err)
	}
	return NewVerifier(k.Keyfunc, base+"/auth/v1"), nil
}

// NewVerifier は公開鍵の取り出し方と発行元（iss）を指定して Verifier を作る。
// テストではテスト用の鍵を返す keyfunc を渡す。
func NewVerifier(kf jwt.Keyfunc, issuer string) *Verifier {
	return &Verifier{keyfunc: kf, issuer: issuer}
}

// Claims は検証済みの JWT から取り出す項目。
type Claims struct {
	UserID string // sub（Supabase のユーザーID）
	// ClientID は Supabase の OAuth サーバーが MCP クライアントなどに発行したトークンにだけ入る。
	// Web アプリのログインで得たトークンでは空。
	ClientID  string
	ExpiresAt time.Time
}

type supabaseClaims struct {
	jwt.RegisteredClaims
	ClientID string `json:"client_id"`
}

// Verify は JWT を検証し、ユーザーID（sub）を返す。
func (v *Verifier) Verify(tokenString string) (string, error) {
	c, err := v.VerifyClaims(tokenString)
	if err != nil {
		return "", err
	}
	return c.UserID, nil
}

// VerifyClaims は JWT を検証し、ユーザーIDなどを返す。
func (v *Verifier) VerifyClaims(tokenString string) (Claims, error) {
	var claims supabaseClaims
	_, err := jwt.ParseWithClaims(tokenString, &claims, v.keyfunc,
		jwt.WithValidMethods(validMethods),
		jwt.WithIssuer(v.issuer),
		jwt.WithAudience(Audience),
		jwt.WithExpirationRequired(),
		// 端末とサーバーの時計の小さなずれは許す
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return Claims{}, err
	}
	// sub は Supabase のユーザーID（UUID）。DB の user_id にそのまま使うので形式を確かめる
	if !uuidPattern.MatchString(claims.Subject) {
		return Claims{}, errors.New("sub is not a uuid")
	}
	// exp は WithExpirationRequired で必ずある
	return Claims{UserID: claims.Subject, ClientID: claims.ClientID, ExpiresAt: claims.ExpiresAt.Time}, nil
}

// Middleware は Authorization: Bearer <JWT> を検証し、
// 通ったらユーザーIDを context に入れて次へ渡す。だめなら 401 を返す。
func (v *Verifier) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := bearerToken(r.Header.Get("Authorization"))
		if !ok {
			unauthorized(w)
			return
		}
		c, err := v.VerifyClaims(token)
		if err != nil {
			// トークン自体はログに出さない
			log.Printf("auth: invalid token: %v", err)
			unauthorized(w)
			return
		}
		// OAuth で MCP クライアント（Claude など）に発行したトークンは /mcp 専用。
		// 同意画面で「読み取りだけ」と約束しているので、ここ（書き込みもできる API）では受け付けない
		if c.ClientID != "" {
			log.Printf("auth: oauth client token is not allowed here")
			unauthorized(w)
			return
		}
		next.ServeHTTP(w, r.WithContext(WithUserID(r.Context(), c.UserID)))
	})
}

func bearerToken(header string) (string, bool) {
	scheme, token, ok := strings.Cut(header, " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return "", false
	}
	token = strings.TrimSpace(token)
	return token, token != ""
}

func unauthorized(w http.ResponseWriter) {
	w.Header().Set("WWW-Authenticate", "Bearer")
	httpjson.Error(w, http.StatusUnauthorized, "unauthorized")
}

type userIDKey struct{}

// WithUserID はユーザーIDを context に入れる。
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, userIDKey{}, userID)
}

// UserID は Middleware が context に入れたユーザーIDを取り出す。
func UserID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(userIDKey{}).(string)
	return id, ok && id != ""
}
