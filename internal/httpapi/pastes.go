package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

const maxPasteBytes = 1 << 20 // 1 MiB per paste body

func (s *Server) handlePastes(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		out, err := s.Store.ListPastes()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	case http.MethodPost:
		var in struct {
			Title    string `json:"title"`
			Language string `json:"language"`
			Body     string `json:"body"`
			// ExpiresIn: "15m", "1h", "1d", "7d", "30d", or "" for no expiry.
			ExpiresIn string `json:"expires_in"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if len(in.Body) > maxPasteBytes {
			http.Error(w, "body too large", http.StatusRequestEntityTooLarge)
			return
		}
		if strings.TrimSpace(in.Body) == "" {
			http.Error(w, "body required", http.StatusBadRequest)
			return
		}
		expires, err := parseExpires(in.ExpiresIn)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		lang := strings.TrimSpace(in.Language)
		if lang == "" {
			lang = "plain"
		}
		p, err := s.Store.CreatePaste(strings.TrimSpace(in.Title), lang, in.Body, expires)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, p)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handlePastesPath(w http.ResponseWriter, r *http.Request) {
	pid := strings.TrimPrefix(r.URL.Path, "/api/pastes/")
	if pid == "" || strings.Contains(pid, "/") {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet:
		p, err := s.Store.PasteByPublicID(pid)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, p)
	case http.MethodDelete:
		if err := s.Store.DeletePaste(pid); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handlePasteRaw serves the paste body as text/plain at /p/<pid>.
func (s *Server) handlePasteRaw(w http.ResponseWriter, r *http.Request) {
	pid := strings.TrimPrefix(r.URL.Path, "/p/")
	if pid == "" || strings.Contains(pid, "/") {
		http.NotFound(w, r)
		return
	}
	p, err := s.Store.PasteByPublicID(pid)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte(p.Body))
}

func parseExpires(d string) (string, error) {
	d = strings.TrimSpace(d)
	if d == "" || d == "never" {
		return "", nil
	}
	allowed := map[string]time.Duration{
		"15m": 15 * time.Minute,
		"1h":  time.Hour,
		"1d":  24 * time.Hour,
		"7d":  7 * 24 * time.Hour,
		"30d": 30 * 24 * time.Hour,
	}
	dur, ok := allowed[d]
	if !ok {
		return "", errors.New("invalid expires_in")
	}
	return time.Now().UTC().Add(dur).Format(time.RFC3339), nil
}
