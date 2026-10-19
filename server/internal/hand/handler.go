package hand

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/kashmii/poker_hand_text_generator_app/server/internal/auth"
	"github.com/kashmii/poker_hand_text_generator_app/server/internal/httpjson"
)

// maxBodyBytes は保存できるハンド1件の大きさの上限（実際のハンドは数KB）
const maxBodyBytes = 256 << 10

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// Handler は /hands の HTTP の入出力を扱う。
type Handler struct {
	store Store
}

// NewHandler は store を使う Handler を作る。
func NewHandler(store Store) *Handler {
	return &Handler{store: store}
}

// Register は /hands のルートを mux に登録する。
// requireAuth（JWT 検証）を通ったリクエストだけが届く。
func (h *Handler) Register(mux *http.ServeMux, requireAuth func(http.Handler) http.Handler) {
	mux.Handle("GET /hands", requireAuth(http.HandlerFunc(h.list)))
	mux.Handle("GET /hands/{id}", requireAuth(http.HandlerFunc(h.get)))
	mux.Handle("PUT /hands/{id}", requireAuth(http.HandlerFunc(h.put)))
	mux.Handle("DELETE /hands/{id}", requireAuth(http.HandlerFunc(h.delete)))
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID := mustUserID(r)
	summaries, err := h.store.List(r.Context(), userID)
	if err != nil {
		internalError(w, err)
		return
	}
	if summaries == nil {
		summaries = []Summary{} // 0件のときも null ではなく [] を返す
	}
	httpjson.Write(w, http.StatusOK, map[string]any{"hands": summaries})
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	hand, err := h.store.Get(r.Context(), mustUserID(r), id)
	if errors.Is(err, ErrNotFound) {
		httpjson.Error(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		internalError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, hand)
}

// put はハンドを作成または更新する。本文はフロントの HandData をそのまま受け取る。
// 同じIDで何度送っても結果は同じなので、通信失敗時に再送しても二重登録にならない。
func (h *Handler) put(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			httpjson.Error(w, http.StatusRequestEntityTooLarge, "body too large")
			return
		}
		httpjson.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	in, err := parseHandData(id, body)
	if err != nil {
		httpjson.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	summary, err := h.store.Upsert(r.Context(), mustUserID(r), in)
	if errors.Is(err, ErrNotFound) {
		// 同じIDのハンドが他人のもの
		httpjson.Error(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		internalError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, summary)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	err := h.store.Delete(r.Context(), mustUserID(r), id)
	if errors.Is(err, ErrNotFound) {
		httpjson.Error(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		internalError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handDataMeta は HandData のうち、列として保存する項目だけを読むための型。
// 残りは Go 側で解釈せず、JSON のまま data 列に保存する。
type handDataMeta struct {
	ID      *string `json:"id"`
	Title   string  `json:"title"`
	Session *struct {
		VenueName string `json:"venueName"`
		Date      string `json:"date"`
	} `json:"session"`
}

// parseHandData は本文（HandData の JSON）を検証し、保存する内容を作る。
func parseHandData(id string, body []byte) (Input, error) {
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 || trimmed[0] != '{' || !json.Valid(trimmed) {
		return Input{}, errors.New("body must be a JSON object")
	}
	var meta handDataMeta
	if err := json.Unmarshal(trimmed, &meta); err != nil {
		return Input{}, errors.New("invalid hand data")
	}
	// 本文の id は省略できるが、書くならパスの id と同じにする
	if meta.ID != nil && !strings.EqualFold(*meta.ID, id) {
		return Input{}, errors.New("id in body does not match path")
	}

	in := Input{ID: id, Title: meta.Title, Data: json.RawMessage(trimmed)}
	if meta.Session != nil {
		in.VenueName = meta.Session.VenueName
		// 日付として読めるときだけ保存する（壊れた値は null 扱い）
		if _, err := time.Parse(time.DateOnly, meta.Session.Date); err == nil {
			d := meta.Session.Date
			in.PlayedOn = &d
		}
	}
	return in, nil
}

// pathID はパスの {id} を取り出して UUID か確かめる。だめなら 400 を返す。
func pathID(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		httpjson.Error(w, http.StatusBadRequest, "invalid id")
		return "", false
	}
	return strings.ToLower(id), true
}

// mustUserID は JWT 検証で context に入ったユーザーIDを取り出す。
// requireAuth を通っていれば必ず入っている。入っていないのは組み立ての誤り
func mustUserID(r *http.Request) string {
	id, ok := auth.UserID(r.Context())
	if !ok {
		panic("hand: user id is not in context (requireAuth is missing)")
	}
	return id
}

func internalError(w http.ResponseWriter, err error) {
	log.Printf("hand: %v", err)
	httpjson.Error(w, http.StatusInternalServerError, "internal error")
}
