package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
)

// fakeDB は Ping の結果を固定で返す偽の DB
type fakeDB struct{ err error }

func (f fakeDB) Ping(ctx context.Context) error { return f.err }

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
			h := newRouter(nil, tt.db)
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
	h := newRouter(nil, fakeDB{})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/health", nil))

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}
}

func TestCORS(t *testing.T) {
	allowed := "https://allowed.example.com"
	h := newRouter([]string{allowed}, fakeDB{})

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
	h := newRouter([]string{allowed}, fakeDB{})

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
