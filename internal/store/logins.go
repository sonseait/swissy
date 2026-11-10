package store

import "time"

type LoginEntry struct {
	ID         int64  `json:"id"`
	Type       string `json:"type"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	TotpSecret string `json:"totp_secret"`
	PublicID   string `json:"public_id"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

func (s *Store) ListLogins() ([]LoginEntry, error) {
	rows, err := s.db.Query(`SELECT id, type, username, password, totp_secret, public_id, created_at, updated_at FROM logins ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LoginEntry{}
	for rows.Next() {
		var e LoginEntry
		if err := rows.Scan(&e.ID, &e.Type, &e.Username, &e.Password, &e.TotpSecret, &e.PublicID, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}

func (s *Store) InsertLogin(typ, username, password, totpSecret string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(
		`INSERT INTO logins (type, username, password, totp_secret, public_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		typ, username, password, totpSecret, NewPublicID(), now, now,
	)
	return err
}

func (s *Store) TouchLogin(publicID string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`UPDATE logins SET updated_at = ? WHERE public_id = ?`, now, publicID)
	return err
}

func (s *Store) DeleteLogin(publicID string) error {
	_, err := s.db.Exec(`DELETE FROM logins WHERE public_id = ?`, publicID)
	return err
}
