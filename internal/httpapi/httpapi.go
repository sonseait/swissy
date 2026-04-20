// Package httpapi wires HTTP handlers to the store, hub, and S3 client.
package httpapi

import (
	"encoding/json"
	"net/http"

	"swissy/internal/hub"
	"swissy/internal/s3"
	"swissy/internal/store"
	"swissy/internal/web"
)

type Server struct {
	Store *store.Store
	Hub   *hub.Hub
	S3    *s3.Client
}

// Handler builds the http.Handler serving both the embedded UI and the JSON API.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(web.FS())))

	mux.HandleFunc("/api/totps", s.handleTOTPs)
	mux.HandleFunc("/api/totps/", s.handleTOTPByID)

	mux.HandleFunc("/api/logins", s.handleLogins)
	mux.HandleFunc("/api/logins/", s.handleLoginsPath)

	mux.HandleFunc("/api/domains", s.handleDomains)
	mux.HandleFunc("/api/domains/", s.handleDomainByID)
	mux.HandleFunc("/api/mailboxes", s.handleMailboxes)
	mux.HandleFunc("/api/mailboxes/", s.handleMailboxesPath)
	mux.HandleFunc("/api/mail/stream", s.handleMailStream)
	mux.HandleFunc("/api/mail/", s.handleMailContent)

	return mux
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
