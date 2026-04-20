// Package smtpsrv runs the inbound SMTP receiver that persists mails into the
// store and S3, and fans out events through the hub.
package smtpsrv

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/mail"
	"strings"
	"time"

	"github.com/emersion/go-sasl"
	"github.com/emersion/go-smtp"

	"swissy/internal/hub"
	"swissy/internal/s3"
	"swissy/internal/store"
)

const maxMessageBytes = 25 * 1024 * 1024

type Server struct {
	Addr     string
	Domain   string
	Store    *store.Store
	S3       *s3.Client
	Hub      *hub.Hub
}

// ListenAndServe blocks until the underlying smtp server exits. It calls
// log.Fatal if the server exits with a non-clean error.
func (s *Server) ListenAndServe() {
	srv := smtp.NewServer(&backend{s: s})
	srv.Addr = s.Addr
	srv.Domain = s.Domain
	srv.ReadTimeout = 30 * time.Second
	srv.WriteTimeout = 30 * time.Second
	srv.MaxMessageBytes = maxMessageBytes
	srv.MaxRecipients = 20
	srv.AllowInsecureAuth = true

	log.Printf("smtp listening on %s", s.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, smtp.ErrServerClosed) {
		log.Fatalf("smtp server: %v", err)
	}
}

type backend struct{ s *Server }

func (b *backend) NewSession(c *smtp.Conn) (smtp.Session, error) {
	return &session{srv: b.s, remote: c.Conn().RemoteAddr().String()}, nil
}

type session struct {
	srv    *Server
	remote string
	from   string
	to     []string
}

func (s *session) AuthMechanisms() []string              { return nil }
func (s *session) Auth(mech string) (sasl.Server, error) { return nil, smtp.ErrAuthUnsupported }
func (s *session) Reset()                                { s.from = ""; s.to = nil }
func (s *session) Logout() error                         { return nil }

func (s *session) Mail(from string, _ *smtp.MailOptions) error {
	s.from = from
	return nil
}

func (s *session) Rcpt(to string, _ *smtp.RcptOptions) error {
	to = strings.ToLower(strings.TrimSpace(to))
	if !strings.Contains(to, "@") {
		return &smtp.SMTPError{Code: 501, Message: "bad recipient"}
	}
	ok, _ := s.srv.Store.MailboxExists(to)
	if !ok {
		return &smtp.SMTPError{Code: 550, EnhancedCode: smtp.EnhancedCode{5, 1, 1}, Message: "mailbox does not exist"}
	}
	s.to = append(s.to, to)
	return nil
}

func (s *session) Data(r io.Reader) error {
	raw, err := io.ReadAll(io.LimitReader(r, maxMessageBytes))
	if err != nil {
		return err
	}
	subject, sender := "", s.from
	if msg, err := mail.ReadMessage(strings.NewReader(string(raw))); err == nil {
		subject = decodeHeader(msg.Header.Get("Subject"))
		if f := msg.Header.Get("From"); f != "" {
			sender = decodeHeader(f)
		}
	}
	now := time.Now().UTC()
	received := now.Format(time.RFC3339)

	for _, to := range s.to {
		key := fmt.Sprintf("mail/%s/%s-%s.eml", to, now.Format("20060102T150405"), randHex(6))
		if s.srv.S3 != nil {
			if err := s.srv.S3.Put(context.Background(), key, raw); err != nil {
				log.Printf("s3 put failed: %v", err)
				return &smtp.SMTPError{Code: 451, Message: "temporary storage failure"}
			}
		}
		id, err := s.srv.Store.InsertMail(to, sender, subject, key, len(raw), received)
		if err != nil {
			log.Printf("db insert failed: %v", err)
			continue
		}
		s.srv.Hub.Publish(hub.MailEvent{
			ID: id, Mailbox: to, Sender: sender, Subject: subject,
			ReceivedAt: received, Size: int64(len(raw)),
		})
	}
	return nil
}

func decodeHeader(s string) string {
	dec := new(mime.WordDecoder)
	if out, err := dec.DecodeHeader(s); err == nil {
		return out
	}
	return s
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
