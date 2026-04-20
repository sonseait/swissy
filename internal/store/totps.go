package store

import (
	"database/sql"
	"errors"
	"time"
)

type TOTPEntry struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Secret    string `json:"secret"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func (s *Store) ListTOTPs() ([]TOTPEntry, error) {
	rows, err := s.db.Query(`SELECT id, name, secret, created_at, updated_at FROM totps ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TOTPEntry{}
	for rows.Next() {
		var e TOTPEntry
		if err := rows.Scan(&e.ID, &e.Name, &e.Secret, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}

// UpsertTOTP inserts a new entry or bumps updated_at (and optionally renames) when
// the secret already exists.
func (s *Store) UpsertTOTP(name, secret string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	var existing TOTPEntry
	err := s.db.QueryRow(`SELECT id, name FROM totps WHERE secret = ?`, secret).
		Scan(&existing.ID, &existing.Name)
	if err == nil {
		finalName := existing.Name
		if name != "" {
			finalName = name
		}
		_, err = s.db.Exec(`UPDATE totps SET name = ?, updated_at = ? WHERE id = ?`, finalName, now, existing.ID)
		return err
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	_, err = s.db.Exec(`INSERT INTO totps (name, secret, created_at, updated_at) VALUES (?, ?, ?, ?)`,
		name, secret, now, now)
	return err
}

func (s *Store) DeleteTOTP(id string) error {
	_, err := s.db.Exec(`DELETE FROM totps WHERE id = ?`, id)
	return err
}
