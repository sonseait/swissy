package store

import "time"

type Webhook struct {
	ID        int64  `json:"id"`
	PublicID  string `json:"public_id"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
}

type WebhookEvent struct {
	ID           int64  `json:"id"`
	HookPublicID string `json:"hook_public_id"`
	Method       string `json:"method"`
	Path         string `json:"path"`
	Query        string `json:"query"`
	Headers      string `json:"headers"`
	Body         string `json:"body"`
	ContentType  string `json:"content_type"`
	RemoteAddr   string `json:"remote_addr"`
	Size         int64  `json:"size"`
	ReceivedAt   string `json:"received_at"`
}

func (s *Store) ListWebhooks() ([]Webhook, error) {
	rows, err := s.db.Query(`SELECT id, public_id, name, created_at FROM webhooks ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Webhook{}
	for rows.Next() {
		var h Webhook
		if err := rows.Scan(&h.ID, &h.PublicID, &h.Name, &h.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, nil
}

func (s *Store) CreateWebhook(name string) (Webhook, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	h := Webhook{PublicID: NewPublicID(), Name: name, CreatedAt: now}
	res, err := s.db.Exec(`INSERT INTO webhooks (public_id, name, created_at) VALUES (?, ?, ?)`,
		h.PublicID, h.Name, h.CreatedAt)
	if err != nil {
		return h, err
	}
	h.ID, _ = res.LastInsertId()
	return h, nil
}

func (s *Store) DeleteWebhook(publicID string) error {
	if _, err := s.db.Exec(`DELETE FROM webhook_events WHERE hook_public_id = ?`, publicID); err != nil {
		return err
	}
	_, err := s.db.Exec(`DELETE FROM webhooks WHERE public_id = ?`, publicID)
	return err
}

func (s *Store) WebhookExists(publicID string) (bool, error) {
	var one int
	err := s.db.QueryRow(`SELECT 1 FROM webhooks WHERE public_id = ?`, publicID).Scan(&one)
	return err == nil, nil
}

func (s *Store) InsertWebhookEvent(ev WebhookEvent) (int64, error) {
	res, err := s.db.Exec(
		`INSERT INTO webhook_events (hook_public_id, method, path, query, headers, body, content_type, remote_addr, size, received_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		ev.HookPublicID, ev.Method, ev.Path, ev.Query, ev.Headers, ev.Body, ev.ContentType, ev.RemoteAddr, ev.Size, ev.ReceivedAt,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Store) ListWebhookEvents(publicID string, limit int) ([]WebhookEvent, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	rows, err := s.db.Query(
		`SELECT id, hook_public_id, method, path, query, headers, body, content_type, remote_addr, size, received_at
		 FROM webhook_events WHERE hook_public_id = ? ORDER BY received_at DESC LIMIT ?`,
		publicID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WebhookEvent{}
	for rows.Next() {
		var e WebhookEvent
		if err := rows.Scan(&e.ID, &e.HookPublicID, &e.Method, &e.Path, &e.Query, &e.Headers, &e.Body, &e.ContentType, &e.RemoteAddr, &e.Size, &e.ReceivedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}

func (s *Store) DeleteWebhookEvents(publicID string) error {
	_, err := s.db.Exec(`DELETE FROM webhook_events WHERE hook_public_id = ?`, publicID)
	return err
}
