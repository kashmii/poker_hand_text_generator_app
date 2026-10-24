package mcpserver

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/kashmii/poker_hand_text_generator_app/server/internal/auth/authtest"
	"github.com/kashmii/poker_hand_text_generator_app/server/internal/hand"
	"github.com/kashmii/poker_hand_text_generator_app/server/internal/hand/handtest"
)

const (
	alice = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b"
	bob   = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"

	aliceNew = "11111111-1111-4111-8111-111111111111"
	aliceOld = "22222222-2222-4222-8222-222222222222"
	aliceUnk = "33333333-3333-4333-8333-333333333333"
	bobHand  = "44444444-4444-4444-8444-444444444444"

	clientID = "9a8b7c6d-5e4f-4a2b-8c0d-9e8f7a6b5c4d"
)

type testEnv struct {
	url string
	iss *authtest.Issuer
}

// newTestEnv は /mcp を載せたテスト用サーバーを立てる。alice のハンド3件と bob のハンド1件を入れておく
func newTestEnv(t *testing.T) testEnv {
	t.Helper()
	iss := authtest.New(t, authtest.DefaultIssuer)
	store := handtest.NewMemStore()
	put := func(userID, id, title, venue string, playedOn *string) {
		data := `{"id":"` + id + `","handNumber":1,"notes":"` + title + `"}`
		if _, err := store.Upsert(t.Context(), userID, hand.Input{ID: id, Title: title, VenueName: venue, PlayedOn: playedOn, Data: json.RawMessage(data)}); err != nil {
			t.Fatal(err)
		}
		time.Sleep(time.Millisecond) // MemStore は作成時刻で並べるので、順番をはっきりさせる
	}
	date := func(s string) *string { return &s }
	put(alice, aliceUnk, "", "", nil)
	put(alice, aliceOld, "", "Lucky", date("2026-10-20"))
	put(alice, aliceNew, "3bet pot", "Lucky", date("2026-10-22"))
	put(bob, bobHand, "bob の秘密", "", date("2026-10-21"))

	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	Register(mux, Config{
		BaseURL:    srv.URL,
		AuthServer: "https://test-project.supabase.co/auth/v1/",
		Verifier:   iss.Verifier(),
		Hands:      store,
	})
	return testEnv{url: srv.URL, iss: iss}
}

// oauthToken は Supabase の OAuth サーバーが MCP クライアントに発行するのと同じ形（client_id 付き）のトークンを作る
func (e testEnv) oauthToken(t *testing.T, userID string) string {
	t.Helper()
	c := e.iss.Claims(userID)
	c["client_id"] = clientID
	return e.iss.Sign(t, c)
}

// bearerTransport はすべてのリクエストに Authorization ヘッダーを付ける
type bearerTransport struct{ token string }

func (b bearerTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	r.Header.Set("Authorization", "Bearer "+b.token)
	return http.DefaultTransport.RoundTrip(r)
}

func (e testEnv) connect(t *testing.T, token string) *mcp.ClientSession {
	t.Helper()
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "0.0.0"}, nil)
	session, err := client.Connect(t.Context(), &mcp.StreamableClientTransport{
		Endpoint:             e.url + Path,
		HTTPClient:           &http.Client{Transport: bearerTransport{token: token}},
		DisableStandaloneSSE: true,
	}, nil)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { _ = session.Close() })
	return session
}

func call(t *testing.T, s *mcp.ClientSession, name string, args map[string]any) (string, bool) {
	t.Helper()
	res, err := s.CallTool(t.Context(), &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("CallTool(%s): %v", name, err)
	}
	var texts []string
	for _, c := range res.Content {
		if tc, ok := c.(*mcp.TextContent); ok {
			texts = append(texts, tc.Text)
		}
	}
	return strings.Join(texts, "\n"), res.IsError
}

func TestMetadata(t *testing.T) {
	e := newTestEnv(t)
	for _, path := range []string{MetadataPath, MetadataPath + Path} {
		t.Run(path, func(t *testing.T) {
			res, err := http.Get(e.url + path)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			if res.StatusCode != http.StatusOK {
				t.Fatalf("status = %d", res.StatusCode)
			}
			var got struct {
				Resource             string   `json:"resource"`
				AuthorizationServers []string `json:"authorization_servers"`
			}
			if err := json.NewDecoder(res.Body).Decode(&got); err != nil {
				t.Fatal(err)
			}
			if got.Resource != e.url+Path {
				t.Errorf("resource = %q, want %q", got.Resource, e.url+Path)
			}
			// 末尾のスラッシュは取り除く（issuer と完全一致させるため）
			if !slices.Equal(got.AuthorizationServers, []string{"https://test-project.supabase.co/auth/v1"}) {
				t.Errorf("authorization_servers = %v", got.AuthorizationServers)
			}
		})
	}
}

func TestUnauthorized(t *testing.T) {
	e := newTestEnv(t)
	webToken := e.iss.Token(t, alice) // Web アプリのログインで得たトークン（client_id なし）
	other := authtest.New(t, authtest.DefaultIssuer)
	forged := other.Sign(t, func() jwt.MapClaims { c := other.Claims(alice); c["client_id"] = clientID; return c }())

	tests := []struct {
		name   string
		header string
	}{
		{"トークンなし", ""},
		{"Web ログインのトークンは使えない", "Bearer " + webToken},
		{"別の鍵で署名（偽造）", "Bearer " + forged},
		{"JWT の形をしていない", "Bearer not-a-jwt"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, _ := http.NewRequest(http.MethodPost, e.url+Path, strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Accept", "application/json, text/event-stream")
			if tt.header != "" {
				req.Header.Set("Authorization", tt.header)
			}
			res, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			body, _ := io.ReadAll(res.Body)
			res.Body.Close()

			if res.StatusCode != http.StatusUnauthorized {
				t.Fatalf("status = %d, want 401 (body %q)", res.StatusCode, body)
			}
			// MCP クライアントはここからメタデータ → 認可サーバーをたどる
			want := `resource_metadata="` + e.url + MetadataPath + Path + `"`
			if got := res.Header.Get("WWW-Authenticate"); !strings.Contains(got, want) {
				t.Errorf("WWW-Authenticate = %q, want to contain %q", got, want)
			}
		})
	}
}

func TestTools(t *testing.T) {
	e := newTestEnv(t)
	s := e.connect(t, e.oauthToken(t, alice))

	t.Run("読み取りの 2 つだけを公開する", func(t *testing.T) {
		res, err := s.ListTools(t.Context(), nil)
		if err != nil {
			t.Fatal(err)
		}
		var names []string
		for _, tool := range res.Tools {
			names = append(names, tool.Name)
			if tool.Annotations == nil || !tool.Annotations.ReadOnlyHint {
				t.Errorf("%s is not marked read-only", tool.Name)
			}
		}
		slices.Sort(names)
		if !slices.Equal(names, []string{"get_hand", "list_hands"}) {
			t.Errorf("tools = %v", names)
		}
	})

	t.Run("list_hands は自分のハンドだけを新しい順に返す", func(t *testing.T) {
		got, isErr := call(t, s, "list_hands", nil)
		want := strings.Join([]string{
			"3 件中 3 件（新しい順）",
			"- id: " + aliceNew + " | 2026-10-22 | Lucky | 3bet pot",
			"- id: " + aliceOld + " | 2026-10-20 | Lucky",
			"- id: " + aliceUnk + " | 日付不明",
		}, "\n")
		if isErr || got != want {
			t.Errorf("got (isError=%v):\n%s\nwant:\n%s", isErr, got, want)
		}
	})

	t.Run("limit と日付で絞る", func(t *testing.T) {
		got, _ := call(t, s, "list_hands", map[string]any{"limit": 1})
		if !strings.HasPrefix(got, "3 件中 1 件") || !strings.Contains(got, aliceNew) {
			t.Errorf("limit: %s", got)
		}
		// 日付で絞ると、日付が分からないハンドは外れる
		got, _ = call(t, s, "list_hands", map[string]any{"playedFrom": "2026-10-21"})
		if !strings.HasPrefix(got, "1 件中 1 件") || !strings.Contains(got, aliceNew) {
			t.Errorf("playedFrom: %s", got)
		}
		got, _ = call(t, s, "list_hands", map[string]any{"playedTo": "2026-10-21"})
		if !strings.HasPrefix(got, "1 件中 1 件") || !strings.Contains(got, aliceOld) {
			t.Errorf("playedTo: %s", got)
		}
	})

	t.Run("list_hands の不正な引数はツールのエラー", func(t *testing.T) {
		for _, args := range []map[string]any{{"limit": 201}, {"limit": -1}, {"playedFrom": "10/21"}} {
			if got, isErr := call(t, s, "list_hands", args); !isErr {
				t.Errorf("%v: isError = false (%s)", args, got)
			}
		}
	})

	t.Run("get_hand は記録データを返す", func(t *testing.T) {
		got, isErr := call(t, s, "get_hand", map[string]any{"id": strings.ToUpper(aliceNew)})
		if isErr {
			t.Fatalf("isError: %s", got)
		}
		for _, want := range []string{"id: " + aliceNew, "日付: 2026-10-22", "店: Lucky", "タイトル: 3bet pot", `"handNumber": 1`} {
			if !strings.Contains(got, want) {
				t.Errorf("missing %q in:\n%s", want, got)
			}
		}
	})

	t.Run("他人のハンドは見つからない扱い", func(t *testing.T) {
		got, isErr := call(t, s, "get_hand", map[string]any{"id": bobHand})
		if !isErr || !strings.Contains(got, "見つからない") || strings.Contains(got, "bob の秘密") {
			t.Errorf("isError=%v: %s", isErr, got)
		}
	})

	t.Run("UUID でない id はツールのエラー", func(t *testing.T) {
		if got, isErr := call(t, s, "get_hand", map[string]any{"id": "../me"}); !isErr {
			t.Errorf("isError = false: %s", got)
		}
	})
}

func TestOtherUserSeesOnlyOwnHands(t *testing.T) {
	e := newTestEnv(t)
	s := e.connect(t, e.oauthToken(t, bob))
	got, _ := call(t, s, "list_hands", nil)
	want := "1 件中 1 件（新しい順）\n- id: " + bobHand + " | 2026-10-21 | bob の秘密"
	if got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestSummaryLineCards(t *testing.T) {
	d := "2026-10-22"
	h := hand.Summary{
		ID:            aliceNew,
		PlayedOn:      &d,
		HeroHoleCards: json.RawMessage(`[{"rank":"A","suit":"s"},{"rank":"K","suit":"s"}]`),
		Board:         json.RawMessage(`[{"rank":"Q","suit":"h"},{"rank":"J","suit":"d"},{"rank":"2","suit":"c"}]`),
	}
	want := "- id: " + aliceNew + " | 2026-10-22 | Hero: A♠ K♠ | Board: Q♥ J♦ 2♣"
	if got := summaryLine(h); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
	// ヒーローのカードが null のときは出さない
	h.HeroHoleCards = json.RawMessage(`null`)
	if got := summaryLine(h); strings.Contains(got, "Hero") {
		t.Errorf("got %q", got)
	}
}
