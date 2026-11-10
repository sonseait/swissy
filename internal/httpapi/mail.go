package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// handleMailContent serves raw .eml bytes by mail id.
func (s *Server) handleMailContent(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/mail/")
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}
	key, err := s.Store.MailS3Key(id)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if s.S3 == nil {
		http.Error(w, "s3 disabled", http.StatusServiceUnavailable)
		return
	}
	data, err := s.S3.Get(r.Context(), key)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "message/rfc822")
	_, _ = w.Write(data)
}

// handleMailStream is the SSE endpoint fanning out new-mail events for a mailbox.
func (s *Server) handleMailStream(w http.ResponseWriter, r *http.Request) {
	addr := r.URL.Query().Get("addr")
	if addr == "" {
		http.Error(w, "addr required", http.StatusBadRequest)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := s.Hub.Subscribe(addr)
	defer s.Hub.Unsubscribe(addr, ch)

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
