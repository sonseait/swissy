// Package store is the SQLite persistence layer.
package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"strings"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

// Open opens (or creates) the SQLite database at path and applies the schema.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	_, err := s.db.Exec(schema)
	return err
}

const schema = `
CREATE TABLE IF NOT EXISTS totps (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL DEFAULT '',
	secret TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS domains (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mailboxes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	addr TEXT NOT NULL UNIQUE,
	local TEXT NOT NULL,
	domain TEXT NOT NULL,
	public_id TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mails (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	mailbox TEXT NOT NULL,
	sender TEXT NOT NULL,
	subject TEXT NOT NULL,
	s3_key TEXT NOT NULL,
	size INTEGER NOT NULL,
	received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mails_mailbox ON mails(mailbox, received_at DESC);
CREATE TABLE IF NOT EXISTS logins (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	type TEXT NOT NULL DEFAULT '',
	username TEXT NOT NULL,
	password TEXT NOT NULL DEFAULT '',
	totp_secret TEXT NOT NULL DEFAULT '',
	public_id TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logins_updated ON logins(updated_at DESC);

CREATE TABLE IF NOT EXISTS webhooks (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	public_id TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	hook_public_id TEXT NOT NULL,
	method TEXT NOT NULL,
	path TEXT NOT NULL DEFAULT '',
	query TEXT NOT NULL DEFAULT '',
	headers TEXT NOT NULL DEFAULT '',
	body TEXT NOT NULL DEFAULT '',
	content_type TEXT NOT NULL DEFAULT '',
	remote_addr TEXT NOT NULL DEFAULT '',
	size INTEGER NOT NULL DEFAULT 0,
	received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhook_events ON webhook_events(hook_public_id, received_at DESC);

CREATE TABLE IF NOT EXISTS pastes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	public_id TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL DEFAULT '',
	language TEXT NOT NULL DEFAULT 'plain',
	body TEXT NOT NULL,
	size INTEGER NOT NULL DEFAULT 0,
	expires_at TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pastes_created ON pastes(created_at DESC);
`

// NewPublicID returns a 10-char lowercase base32 random id suitable for shareable URLs.
func NewPublicID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b))
}
