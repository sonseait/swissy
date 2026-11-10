package store

import "time"

type Mailbox struct {
	ID        int64  `json:"id"`
	Addr      string `json:"addr"`
	Local     string `json:"local"`
	Domain    string `json:"domain"`
	PublicID  string `json:"public_id"`
	CreatedAt string `json:"created_at"`
}

func (s *Store) ListMailboxes() ([]Mailbox, error) {
	rows, err := s.db.Query(`SELECT id, addr, local, domain, public_id, created_at FROM mailboxes ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Mailbox{}
	for rows.Next() {
		var m Mailbox
		if err := rows.Scan(&m.ID, &m.Addr, &m.Local, &m.Domain, &m.PublicID, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

// UpsertMailbox inserts a mailbox if it does not exist and returns its public_id.
func (s *Store) UpsertMailbox(local, domain string) (addr, publicID string, err error) {
	addr = local + "@" + domain
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec(`INSERT OR IGNORE INTO mailboxes (addr, local, domain, public_id, created_at) VALUES (?, ?, ?, ?, ?)`,
		addr, local, domain, NewPublicID(), now)
	if err != nil {
		return "", "", err
	}
	err = s.db.QueryRow(`SELECT public_id FROM mailboxes WHERE addr = ?`, addr).Scan(&publicID)
	return addr, publicID, err
}

func (s *Store) DomainExists(name string) (bool, error) {
	var exists int
	err := s.db.QueryRow(`SELECT 1 FROM domains WHERE name = ?`, name).Scan(&exists)
	if err != nil {
		return false, nil
	}
	return exists == 1, nil
}

func (s *Store) MailboxExists(addr string) (bool, error) {
	var exists int
	err := s.db.QueryRow(`SELECT 1 FROM mailboxes WHERE addr = ?`, addr).Scan(&exists)
	if err != nil {
		return false, nil
	}
	return exists == 1, nil
}

func (s *Store) MailboxByPublicID(pid string) (string, error) {
	var addr string
	err := s.db.QueryRow(`SELECT addr FROM mailboxes WHERE public_id = ?`, pid).Scan(&addr)
	return addr, err
}

func (s *Store) DeleteMailbox(addr string) error {
	if _, err := s.db.Exec(`DELETE FROM mailboxes WHERE addr = ?`, addr); err != nil {
		return err
	}
	_, err := s.db.Exec(`DELETE FROM mails WHERE mailbox = ?`, addr)
	return err
}
