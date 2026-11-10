package store

import "time"

type Paste struct {
	ID        int64  `json:"id"`
	PublicID  string `json:"public_id"`
	Title     string `json:"title"`
	Language  string `json:"language"`
	Body      string `json:"body"`
	Size      int64  `json:"size"`
	ExpiresAt string `json:"expires_at"`
	CreatedAt string `json:"created_at"`
}

func (s *Store) ListPastes() ([]Paste, error) {
	rows, err := s.db.Query(`SELECT id, public_id, title, language, body, size, expires_at, created_at FROM pastes ORDER BY created_at DESC LIMIT 500`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Paste{}
	for rows.Next() {
		var p Paste
		if err := rows.Scan(&p.ID, &p.PublicID, &p.Title, &p.Language, &p.Body, &p.Size, &p.ExpiresAt, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

func (s *Store) CreatePaste(title, lang, body, expiresAt string) (Paste, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	p := Paste{
		PublicID:  NewPublicID(),
		Title:     title,
		Language:  lang,
		Body:      body,
		Size:      int64(len(body)),
		ExpiresAt: expiresAt,
		CreatedAt: now,
	}
	res, err := s.db.Exec(
		`INSERT INTO pastes (public_id, title, language, body, size, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		p.PublicID, p.Title, p.Language, p.Body, p.Size, p.ExpiresAt, p.CreatedAt,
	)
	if err != nil {
		return p, err
	}
	p.ID, _ = res.LastInsertId()
	return p, nil
}

func (s *Store) PasteByPublicID(publicID string) (Paste, error) {
	var p Paste
	err := s.db.QueryRow(
		`SELECT id, public_id, title, language, body, size, expires_at, created_at FROM pastes WHERE public_id = ?`,
		publicID,
	).Scan(&p.ID, &p.PublicID, &p.Title, &p.Language, &p.Body, &p.Size, &p.ExpiresAt, &p.CreatedAt)
	return p, err
}

func (s *Store) DeletePaste(publicID string) error {
	_, err := s.db.Exec(`DELETE FROM pastes WHERE public_id = ?`, publicID)
	return err
}

// DeleteExpiredPastes removes pastes with expires_at <= now. Safe to run periodically.
func (s *Store) DeleteExpiredPastes() error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`DELETE FROM pastes WHERE expires_at != '' AND expires_at <= ?`, now)
	return err
}
