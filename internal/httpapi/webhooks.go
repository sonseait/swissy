package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"swissy/internal/hub"
	"swissy/internal/store"
)

const maxWebhookBodyBytes = 1 << 20 // 1 MiB captured per request

func (s *Server) handleWebhooks(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		out, err := s.Store.ListWebhooks()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	case http.MethodPost:
		var in struct {
			Name string `json:"name"`
		}
		_ = json.NewDecoder(r.Body).Decode(&in)
		h, err := s.Store.CreateWebhook(strings.TrimSpace(in.Name))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, h)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// /api/webhooks/<pid>          GET = list events, DELETE = remove hook
// /api/webhooks/<pid>/events   DELETE = clear events
// /api/webhooks/<pid>/stream   GET = SSE feed
func (s *Server) handleWebhooksPath(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/webhooks/")
	parts := strings.Split(rest, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	pid := parts[0]
	tail := ""
	if len(parts) > 1 {
		tail = parts[1]
	}
	switch tail {
	case "":
		if r.Method == http.MethodDelete {
			if err := s.Store.DeleteWebhook(pid); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		out, err := s.Store.ListWebhookEvents(pid, 200)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	case "events":
		if r.Method != http.MethodDelete {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if err := s.Store.DeleteWebhookEvents(pid); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	case "stream":
		s.handleWebhookStream(w, r, pid)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) handleWebhookStream(w http.ResponseWriter, r *http.Request, pid string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	ch := s.WebhookHub.Subscribe(pid)
	defer s.WebhookHub.Unsubscribe(pid, ch)
	fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()
	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case ev, open := <-ch:
			if !open {
				return
			}
			b, _ := json.Marshal(ev)
			fmt.Fprintf(w, "data: %s\n\n", b)
			flusher.Flush()
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}

// /hook/<pid>/...  - inbound from external senders.
func (s *Server) handleHookInbound(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/hook/")
	parts := strings.SplitN(rest, "/", 2)
	pid := parts[0]
	subPath := ""
	if len(parts) > 1 {
		subPath = "/" + parts[1]
	}
	if pid == "" {
		http.NotFound(w, r)
		return
	}
	exists, _ := s.Store.WebhookExists(pid)
	if !exists {
		http.NotFound(w, r)
		return
	}
	body, _ := io.ReadAll(io.LimitReader(r.Body, maxWebhookBodyBytes))
	headers := map[string][]string(r.Header)
	headersJSON, _ := json.Marshal(headers)
	remote := r.Header.Get("X-Forwarded-For")
	if remote == "" {
		remote = r.RemoteAddr
	}
	received := time.Now().UTC().Format(time.RFC3339Nano)
	ev := store.WebhookEvent{
		HookPublicID: pid,
		Method:       r.Method,
		Path:         subPath,
		Query:        r.URL.RawQuery,
		Headers:      string(headersJSON),
		Body:         string(body),
		ContentType:  r.Header.Get("Content-Type"),
		RemoteAddr:   remote,
		Size:         int64(len(body)),
		ReceivedAt:   received,
	}
	id, err := s.Store.InsertWebhookEvent(ev)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.WebhookHub.Publish(hub.WebhookEvent{
		ID: id, HookPublicID: pid, Method: ev.Method, Path: ev.Path,
		Size: ev.Size, ReceivedAt: ev.ReceivedAt,
	})
	w.Header().Set("Content-Type", "application/json")
	_, _ = fmt.Fprintf(w, `{"ok":true,"id":%d}`, id)
}
