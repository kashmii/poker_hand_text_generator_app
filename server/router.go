package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"slices"
	"time"
)

// pinger は DB に疎通確認できるもの（*pgxpool.Pool が満たす）。
// テストでは偽物を差し込む
type pinger interface {
	Ping(ctx context.Context) error
}

// newRouter はルーティングとミドルウェアを組み立てた http.Handler を返す
func newRouter(allowedOrigins []string, db pinger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handleHealth(db))
	return withCORS(allowedOrigins, mux)
}

// handleHealth は死活確認用。DB まで届くかも確かめる。
// Cloud Scheduler から毎日呼び、Supabase 無料プランの一時停止を防ぐ役目もある
func handleHealth(db pinger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()

		if err := db.Ping(ctx); err != nil {
			log.Printf("health: db ping failed: %v", err)
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "ng", "db": "error"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "db": "ok"})
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// withCORS は許可したオリジン（Vercel のフロントなど）からのブラウザアクセスだけを通す
func withCORS(allowedOrigins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && slices.Contains(allowedOrigins, origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
		}

		// プリフライト（ブラウザが本リクエストの前に送る確認）
		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
