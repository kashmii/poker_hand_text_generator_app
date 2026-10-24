package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/kashmii/poker_hand_text_generator_app/server/internal/auth"
	"github.com/kashmii/poker_hand_text_generator_app/server/internal/db"
	"github.com/kashmii/poker_hand_text_generator_app/server/internal/hand"
)

func main() {
	// Cloud Run はインスタンス停止前に SIGTERM を送るので、受け取ったら後片付けして止める
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Cloud Run は環境変数 PORT で待ち受けポートを指定してくる
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// 例: ALLOWED_ORIGINS="http://localhost:5173,https://example.vercel.app"
	allowedOrigins := parseOrigins(os.Getenv("ALLOWED_ORIGINS"))

	// Cloud Run では Secret Manager の値が環境変数として渡される
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}
	pool, err := db.NewPool(ctx, databaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	// 例: SUPABASE_URL="https://<プロジェクトID>.supabase.co"（JWT 検証用の公開鍵の取得先）
	supabaseURL := os.Getenv("SUPABASE_URL")
	if supabaseURL == "" {
		log.Fatal("SUPABASE_URL is not set")
	}
	verifier, err := auth.NewSupabaseVerifier(ctx, supabaseURL)
	if err != nil {
		log.Fatalf("auth: %v", err)
	}

	// 個人用APIキー（MCPサーバー用）。両方そろったときだけ有効にし、片方だけなら設定ミスとして止める
	personalKey := os.Getenv("PERSONAL_API_KEY")
	personalUserID := os.Getenv("PERSONAL_USER_ID")
	switch {
	case personalKey != "" && personalUserID != "":
		if err := verifier.SetPersonalKey(personalKey, personalUserID); err != nil {
			log.Fatalf("auth: %v", err)
		}
		log.Println("auth: personal api key enabled")
	case personalKey != "" || personalUserID != "":
		log.Fatal("PERSONAL_API_KEY and PERSONAL_USER_ID must be set together")
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           newRouter(allowedOrigins, pool, verifier.Middleware, hand.NewPgStore(pool)),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	// 停止の合図が来たら、処理中のリクエストを終えてから止める
	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
	log.Println("server stopped")
}

// parseOrigins はカンマ区切りの文字列を許可オリジンの一覧に変換する
func parseOrigins(s string) []string {
	var origins []string
	for o := range strings.SplitSeq(s, ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}
	return origins
}
