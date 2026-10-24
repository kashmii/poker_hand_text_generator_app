// Package auth は Supabase が発行した JWT（または個人用APIキー）を検証し、リクエストしたユーザーのIDを取り出す。
package auth

import (
	"context"
	"crypto/subtle"
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

// 個人用APIキーの最短の長さ。推測されにくいよう、短いキーは設定させない
const minPersonalKeyLen = 32

// Verifier は JWT の署名・有効期限・発行元・対象を検証する。
type Verifier struct {
	keyfunc jwt.Keyfunc
	issuer  string

	// 個人用APIキー（MCPサーバーから自分のハンドを読むため）。空なら無効
	personalKey    []byte
	personalUserID string
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

// Verify は JWT を検証し、ユーザーID（sub）を返す。
func (v *Verifier) Verify(tokenString string) (string, error) {
	var claims jwt.RegisteredClaims
	_, err := jwt.ParseWithClaims(tokenString, &claims, v.keyfunc,
		jwt.WithValidMethods(validMethods),
		jwt.WithIssuer(v.issuer),
		jwt.WithAudience(Audience),
		jwt.WithExpirationRequired(),
		// 端末とサーバーの時計の小さなずれは許す
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return "", err
	}
	// sub は Supabase のユーザーID（UUID）。DB の user_id にそのまま使うので形式を確かめる
	if !uuidPattern.MatchString(claims.Subject) {
		return "", errors.New("sub is not a uuid")
	}
	return claims.Subject, nil
}

// SetPersonalKey は個人用APIキーを有効にする。
// Bearer にこのキーが来たら JWT 検証をせず、userID のユーザーとして通す（GET/HEAD のみ）。
func (v *Verifier) SetPersonalKey(apiKey, userID string) error {
	if len(apiKey) < minPersonalKeyLen {
		return fmt.Errorf("personal api key must be at least %d characters", minPersonalKeyLen)
	}
	if !uuidPattern.MatchString(userID) {
		return errors.New("personal user id is not a uuid")
	}
	v.personalKey = []byte(apiKey)
	v.personalUserID = userID
	return nil
}

// isPersonalKey は token が個人用APIキーと一致するかを返す。
// 一致するまでの時間からキーを推測されないよう、比較は一定時間で行う
func (v *Verifier) isPersonalKey(token string) bool {
	return len(v.personalKey) > 0 && subtle.ConstantTimeCompare([]byte(token), v.personalKey) == 1
}

// Middleware は Authorization: Bearer <JWT または個人用APIキー> を検証し、
// 通ったらユーザーIDを context に入れて次へ渡す。だめなら 401 を返す。
func (v *Verifier) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := bearerToken(r.Header.Get("Authorization"))
		if !ok {
			unauthorized(w)
			return
		}
		if v.isPersonalKey(token) {
			// 個人用キーは設定ファイルに平文で置くので、漏れても読まれるだけで済むよう読み取りに限る
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				httpjson.Error(w, http.StatusForbidden, "forbidden")
				return
			}
			next.ServeHTTP(w, r.WithContext(WithUserID(r.Context(), v.personalUserID)))
			return
		}
		userID, err := v.Verify(token)
		if err != nil {
			// トークン自体はログに出さない
			log.Printf("auth: invalid token: %v", err)
			unauthorized(w)
			return
		}
		next.ServeHTTP(w, r.WithContext(WithUserID(r.Context(), userID)))
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
