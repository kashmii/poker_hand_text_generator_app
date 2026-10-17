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

	"github.com/kashmii/poker_hand_text_generator_app/server/internal/db"
)

func main() {
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
	pool, err := db.NewPool(context.Background(), databaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           newRouter(allowedOrigins, pool),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Cloud Run はインスタンス停止前に SIGTERM を送るので、処理中のリクエストを終えてから止める
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
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
