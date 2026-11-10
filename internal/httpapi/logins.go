package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"swissy/internal/otp"
)

func (s *Server) handleLogins(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		out, err := s.Store.ListLogins()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, out)
	case http.MethodPost:
		s.createLogin(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleLoginsPath(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/logins/")
	if strings.HasSuffix(rest, "/touch") {
		if r.Method != http.MethodPut {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		pid := strings.TrimSuffix(rest, "/touch")
		if err := s.Store.TouchLogin(pid); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := s.Store.DeleteLogin(rest); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) createLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Type       string `json:"type"`
		Username   string `json:"username"`
		Password   string `json:"password"`
		TotpSecret string `json:"totp_secret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	username := strings.TrimSpace(in.Username)
	if username == "" {
		http.Error(w, "username required", http.StatusBadRequest)
		return
	}
	totpSecret := ""
	if s := strings.TrimSpace(in.TotpSecret); s != "" {
		parsed, _, err := otp.ParseSecret(s)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		totpSecret = parsed
	}
	if err := s.Store.InsertLogin(strings.TrimSpace(in.Type), username, in.Password, totpSecret); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	out, err := s.Store.ListLogins()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, out)
}
