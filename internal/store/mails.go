package store

type MailItem struct {
	ID         int64  `json:"id"`
	Sender     string `json:"sender"`
	Subject    string `json:"subject"`
	Size       int64  `json:"size"`
	ReceivedAt string `json:"received_at"`
}

func (s *Store) ListMails(mailbox string) ([]MailItem, error) {
	rows, err := s.db.Query(`SELECT id, sender, subject, size, received_at FROM mails WHERE mailbox = ? ORDER BY received_at DESC LIMIT 500`, mailbox)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MailItem{}
	for rows.Next() {
		var it MailItem
		if err := rows.Scan(&it.ID, &it.Sender, &it.Subject, &it.Size, &it.ReceivedAt); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, nil
}

func (s *Store) InsertMail(mailbox, sender, subject, s3Key string, size int, receivedAt string) (int64, error) {
	res, err := s.db.Exec(`INSERT INTO mails (mailbox, sender, subject, s3_key, size, received_at) VALUES (?, ?, ?, ?, ?, ?)`,
		mailbox, sender, subject, s3Key, size, receivedAt)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Store) MailS3Key(id string) (string, error) {
	var key string
	err := s.db.QueryRow(`SELECT s3_key FROM mails WHERE id = ?`, id).Scan(&key)
	return key, err
}
