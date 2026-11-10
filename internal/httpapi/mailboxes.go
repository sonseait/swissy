package httpapi

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
)

var localRe = regexp.MustCompile(`^[a-z0-9][a-z0-9._+-]{0,63}$`)

func (s *Server) handleMailboxes(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		out, err := s.Store.ListMailboxes()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	case http.MethodPost:
		var in struct {
			Local  string `json:"local"`
			Domain string `json:"domain"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		local := strings.ToLower(strings.TrimSpace(in.Local))
		domain := strings.ToLower(strings.TrimSpace(in.Domain))
		if !localRe.MatchString(local) {
			http.Error(w, "invalid local part", http.StatusBadRequest)
			return
		}
		ok, _ := s.Store.DomainExists(domain)
		if !ok {
			http.Error(w, "domain not registered", http.StatusBadRequest)
			return
		}
		addr, pid, err := s.Store.UpsertMailbox(local, domain)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]string{"addr": addr, "public_id": pid})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleMailboxesPath(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/mailboxes/")
	if strings.HasPrefix(rest, "by-id/") {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		pid := strings.TrimPrefix(rest, "by-id/")
		if pid == "" || strings.Contains(pid, "/") {
			http.NotFound(w, r)
			return
		}
		addr, err := s.Store.MailboxByPublicID(pid)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, map[string]string{"addr": addr, "public_id": pid})
		return
	}
	addr := rest
	switch r.Method {
	case http.MethodDelete:
		if err := s.Store.DeleteMailbox(addr); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	case http.MethodGet:
		out, err := s.Store.ListMails(addr)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
