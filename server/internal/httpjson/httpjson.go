// Package httpjson は JSON で応答するための小さな共通処理。
package httpjson

import (
	"encoding/json"
	"net/http"
)

// Write は v を JSON にして status とともに返す。
func Write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Error は {"error": message} を返す。
func Error(w http.ResponseWriter, status int, message string) {
	Write(w, status, map[string]string{"error": message})
}
