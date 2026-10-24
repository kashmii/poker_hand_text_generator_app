// Package mcpserver は、Claude などの MCP クライアントから自分のハンドを読むためのリモート MCP サーバー（/mcp）。
// 認可（ログイン・同意・トークン発行）は Supabase Auth の OAuth 2.1 サーバーが行い、
// ここでは発行されたアクセストークンを検証して、そのユーザーのハンドだけを読み取り専用で返す。
package mcpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	sdkauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/modelcontextprotocol/go-sdk/oauthex"

	"github.com/kashmii/poker_hand_text_generator_app/server/internal/auth"
	"github.com/kashmii/poker_hand_text_generator_app/server/internal/hand"
)

// MCP エンドポイントと、その保護リソースメタデータ（RFC 9728）のパス
const (
	Path         = "/mcp"
	MetadataPath = "/.well-known/oauth-protected-resource"
)

// Config は /mcp を組み立てるための設定。
type Config struct {
	// BaseURL はこのサーバーの公開URL（例: https://xxx.run.app）。リソースの識別子とメタデータの URL に使う
	BaseURL string
	// AuthServer は認可サーバーの issuer（Supabase なら https://<プロジェクトID>.supabase.co/auth/v1）
	AuthServer string
	Verifier   *auth.Verifier
	Hands      hand.Store
}

// Register は /mcp と保護リソースメタデータを mux に登録する。
func Register(mux *http.ServeMux, cfg Config) {
	base := strings.TrimRight(cfg.BaseURL, "/")
	metadata := sdkauth.ProtectedResourceMetadataHandler(&oauthex.ProtectedResourceMetadata{
		Resource:               base + Path,
		AuthorizationServers:   []string{strings.TrimRight(cfg.AuthServer, "/")},
		BearerMethodsSupported: []string{"header"},
		ResourceName:           "Poker Hand Text Generator",
	})
	// クライアントによっては、リソースのパスを後ろに付けた URL（RFC 9728 §3.1）で取りに来るので両方に出す
	mux.Handle("GET "+MetadataPath, metadata)
	mux.Handle("GET "+MetadataPath+Path, metadata)

	server := newServer(cfg.Hands)
	streamable := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{
		// Cloud Run はインスタンスが入れ替わるので、セッションを持たない
		Stateless:    true,
		JSONResponse: true,
	})
	requireToken := sdkauth.RequireBearerToken(tokenVerifier(cfg.Verifier), &sdkauth.RequireBearerTokenOptions{
		ResourceMetadataURL: base + MetadataPath + Path,
		// 端末とサーバーの時計の小さなずれは許す（auth.Verifier と同じ）
		ClockSkew: 30 * time.Second,
	})
	mux.Handle(Path, requireToken(streamable))
}

// tokenVerifier は Supabase の JWT を検証する。
// /mcp では、Supabase の OAuth サーバーが MCP クライアント向けに発行したトークン（client_id 付き）だけを通す。
// Web アプリのログインで得たトークンは、MCP クライアントに渡すためのものではないので受け付けない。
func tokenVerifier(v *auth.Verifier) sdkauth.TokenVerifier {
	return func(ctx context.Context, token string, _ *http.Request) (*sdkauth.TokenInfo, error) {
		c, err := v.VerifyClaims(token)
		if err != nil {
			// 理由はログにだけ出し、クライアントには返さない（トークン自体もログに出さない）
			log.Printf("mcp: invalid token: %v", err)
			return nil, sdkauth.ErrInvalidToken
		}
		if c.ClientID == "" {
			log.Printf("mcp: token has no client_id (not issued by the oauth server)")
			return nil, sdkauth.ErrInvalidToken
		}
		return &sdkauth.TokenInfo{
			UserID:     c.UserID,
			Expiration: c.ExpiresAt,
			Extra:      map[string]any{"client_id": c.ClientID},
		}, nil
	}
}

func newServer(hands hand.Store) *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: "poker-hands", Title: "Poker Hand Text Generator", Version: "0.1.0"}, nil)
	t := tools{hands: hands}
	closedWorld := false // 外部のものには触れず、自分のハンドだけを読む
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: &closedWorld}
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_hands",
		Title:       "ハンド一覧",
		Description: "自分が記録したポーカーのハンドの一覧を新しい順に返す。各行の id を get_hand に渡すと、そのハンドの詳細（アクションの流れ）を読める。",
		Annotations: readOnly,
	}, t.listHands)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_hand",
		Title:       "ハンドの詳細",
		Description: "id を指定して、自分のハンド1件の記録データ（ブラインド・プレイヤー・各ストリートのアクション・ボード・結果・メモ）を JSON で返す。id は list_hands で調べる。",
		Annotations: readOnly,
	}, t.getHand)
	return server
}

const (
	defaultLimit = 20
	maxLimit     = 200
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// errInternal はクライアントに返す内部エラー。DB のエラー文などは返さない
var errInternal = errors.New("ハンドを取得できなかった。時間をおいて試して")

type tools struct {
	hands hand.Store
}

type listHandsInput struct {
	Limit      int    `json:"limit,omitempty" jsonschema:"返す件数（既定 20、最大 200）"`
	PlayedFrom string `json:"playedFrom,omitempty" jsonschema:"この日以降にプレイしたハンドだけ（YYYY-MM-DD）"`
	PlayedTo   string `json:"playedTo,omitempty" jsonschema:"この日以前にプレイしたハンドだけ（YYYY-MM-DD）"`
}

func (t tools) listHands(ctx context.Context, req *mcp.CallToolRequest, in listHandsInput) (*mcp.CallToolResult, any, error) {
	limit := in.Limit
	if limit == 0 {
		limit = defaultLimit
	}
	if limit < 1 || limit > maxLimit {
		return nil, nil, fmt.Errorf("limit は 1〜%d で指定して", maxLimit)
	}
	for _, d := range []string{in.PlayedFrom, in.PlayedTo} {
		if _, err := time.Parse(time.DateOnly, d); d != "" && err != nil {
			return nil, nil, fmt.Errorf("日付は YYYY-MM-DD で指定して: %q", d)
		}
	}

	all, err := t.hands.List(ctx, userID(req))
	if err != nil {
		log.Printf("mcp: list hands: %v", err)
		return nil, nil, errInternal
	}
	// 日付で絞るときは、日付が分からないハンドは外す（YYYY-MM-DD は文字列のまま大小比較できる）
	var filtered []hand.Summary
	for _, h := range all {
		if in.PlayedFrom != "" && (h.PlayedOn == nil || *h.PlayedOn < in.PlayedFrom) {
			continue
		}
		if in.PlayedTo != "" && (h.PlayedOn == nil || *h.PlayedOn > in.PlayedTo) {
			continue
		}
		filtered = append(filtered, h)
	}
	shown := filtered[:min(limit, len(filtered))]

	lines := []string{fmt.Sprintf("%d 件中 %d 件（新しい順）", len(filtered), len(shown))}
	for _, h := range shown {
		lines = append(lines, summaryLine(h))
	}
	return textResult(strings.Join(lines, "\n")), nil, nil
}

type getHandInput struct {
	ID string `json:"id" jsonschema:"list_hands が返したハンドの id"`
}

func (t tools) getHand(ctx context.Context, req *mcp.CallToolRequest, in getHandInput) (*mcp.CallToolResult, any, error) {
	if !uuidPattern.MatchString(in.ID) {
		return nil, nil, errors.New("id は list_hands が返した UUID を指定して")
	}
	h, err := t.hands.Get(ctx, userID(req), strings.ToLower(in.ID))
	if errors.Is(err, hand.ErrNotFound) {
		// 他人のハンドがあることも教えないため、存在しないときと同じ返事にする
		res := textResult(fmt.Sprintf("id %s のハンドは見つからない。list_hands で id を確認して。", in.ID))
		res.IsError = true
		return res, nil, nil
	}
	if err != nil {
		log.Printf("mcp: get hand: %v", err)
		return nil, nil, errInternal
	}

	header := []string{"id: " + h.ID}
	if h.PlayedOn != nil {
		header = append(header, "日付: "+*h.PlayedOn)
	}
	if h.VenueName != "" {
		header = append(header, "店: "+h.VenueName)
	}
	if h.Title != "" {
		header = append(header, "タイトル: "+h.Title)
	}
	var data bytes.Buffer
	if err := json.Indent(&data, h.Data, "", "  "); err != nil {
		data.Reset()
		data.Write(h.Data)
	}
	text := strings.Join(header, "\n") + "\n\n記録データ（JSON）:\n" + data.String()
	return textResult(text), nil, nil
}

// userID は RequireBearerToken が検証したトークンのユーザーIDを返す。
// /mcp は必ずトークンの検証を通るので、入っていないのは組み立ての誤り
func userID(req *mcp.CallToolRequest) string {
	if req.Extra == nil || req.Extra.TokenInfo == nil || req.Extra.TokenInfo.UserID == "" {
		panic("mcpserver: token info is not in request (RequireBearerToken is missing)")
	}
	return req.Extra.TokenInfo.UserID
}

func textResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: text}}}
}

func summaryLine(h hand.Summary) string {
	parts := []string{"id: " + h.ID}
	if h.PlayedOn != nil {
		parts = append(parts, *h.PlayedOn)
	} else {
		parts = append(parts, "日付不明")
	}
	if h.VenueName != "" {
		parts = append(parts, h.VenueName)
	}
	if h.Title != "" {
		parts = append(parts, h.Title)
	}
	if cards := formatCards(h.HeroHoleCards); cards != "" {
		parts = append(parts, "Hero: "+cards)
	}
	if cards := formatCards(h.Board); cards != "" {
		parts = append(parts, "Board: "+cards)
	}
	return "- " + strings.Join(parts, " | ")
}

var suitSymbols = map[string]string{"h": "♥", "d": "♦", "c": "♣", "s": "♠"}

// formatCards は [{"rank":"A","suit":"s"},...] を "A♠ K♠" にする。空・null・読めないときは ""
func formatCards(raw json.RawMessage) string {
	var cards []struct {
		Rank string `json:"rank"`
		Suit string `json:"suit"`
	}
	if len(raw) == 0 || json.Unmarshal(raw, &cards) != nil {
		return ""
	}
	out := make([]string, 0, len(cards))
	for _, c := range cards {
		suit, ok := suitSymbols[c.Suit]
		if !ok {
			suit = c.Suit
		}
		out = append(out, c.Rank+suit)
	}
	return strings.Join(out, " ")
}
